import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { makeSyntheticPng } from './fixtures/png-factory.mjs';
import { stageLicensedMedia } from '../src/cms/cloudflare-adapters.mjs';

/** TUR060: original Next.js HTTP + independent PG16 owner SECURITY DEFINER ACL persistence,
 * distinct real PG16 reader/revoker logins and only synthetic in-memory R2.
 * This is a NEGATIVE regression, not a last-network-byte or CDN proof.
 */
const URI = process.env.TEST_DATABASE_URL;
if (process.env.CI !== 'true' || !URI ||
    !['127.0.0.1','localhost'].includes(new URL(URI).hostname))
  throw Error('TUR041 requires CI disposable localhost PostgreSQL16');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('TUR060: revoked CREATE ACL leaves owner SECURITY DEFINER executable by untrusted role through actual Next HTTP', { timeout: 120000 }, async () => {
  const suffix = randomBytes(5).toString('hex');
  const schema = 'tw041_' + suffix;
  const roles = [schema + '_reader', schema + '_revoker', schema + '_owner', schema + '_outsider'];
  const passwords = roles.map(() => randomBytes(18).toString('hex'));
  const ids = ['tur041-a', 'tur041-b'];
  const bytes = Buffer.from(makeSyntheticPng(54,44));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const origin = 'http://127.0.0.1:3131';
  const admin = new pg.Client({ connectionString: URI });
  const sessions: pg.Client[] = [];
  let connected = false, server: ChildProcess | undefined, logs = '';
  const cwd = fileURLToPath(new URL('../../../apps/web/', import.meta.url));
  const nextBin = fileURLToPath(new URL('../../../apps/web/node_modules/next/dist/bin/next', import.meta.url));
  const preload = fileURLToPath(new URL('../../../scripts/tur041-next-pg16-preload.mjs', import.meta.url));
  try {
    await admin.connect(); connected = true;
    for (let i = 0; i < roles.length; i++)
      await admin.query('CREATE ROLE ' + roles[i] +
        " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + passwords[i] + "'");
    await admin.query('CREATE SCHEMA ' + schema);
    await admin.query('CREATE TABLE ' + schema + '.media (' +
      'id text PRIMARY KEY,key text NOT NULL,sha256_hex text NOT NULL,' +
      'content_type text NOT NULL,bytes int NOT NULL,approved boolean NOT NULL,' +
      'generation bigint NOT NULL CHECK(generation>0))');
    await admin.query('CREATE TABLE ' + schema + '.gates (' +
      'id text PRIMARY KEY,arrived boolean NOT NULL DEFAULT false,' +
      'released boolean NOT NULL DEFAULT false,final_count int NOT NULL DEFAULT 0)');
    await admin.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    for (const role of roles) await admin.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' + role);
    await admin.query('GRANT SELECT ON ' + schema + '.media TO ' + roles[0]);
    await admin.query('GRANT SELECT, UPDATE(arrived,final_count) ON ' + schema + '.gates TO ' + roles[0]);
    await admin.query('GRANT SELECT(id,approved,generation), UPDATE(approved,generation) ON ' +
      schema + '.media TO ' + roles[1]);
    await admin.query('GRANT SELECT(id), UPDATE(released) ON ' + schema + '.gates TO ' + roles[1]);
    // Owner controls the media table and is temporarily granted CREATE on
    // the isolated schema. Once it creates a SECURITY DEFINER program, merely
    // revoking CREATE cannot retract the already published executable object.
    await admin.query('ALTER TABLE ' + schema + '.media OWNER TO ' + roles[2]);
    await admin.query('GRANT CREATE ON SCHEMA ' + schema + ' TO ' + roles[2]);
    const dummyBucket = { async put() {} };
    for (const id of ids) {
      const staged = await stageLicensedMedia(dummyBucket,id,bytes,{
        rightsApproved:true,evidenceRef:'CI_GENERATED_NO_REAL_LICENSE',
        reviewer:'TUR041 Original Fixture Reviewer'
      });
      assert.equal(staged.sha256,hash);
      await admin.query('INSERT INTO ' + schema +
        '.media(id,key,sha256_hex,content_type,bytes,approved,generation) VALUES($1,$2,$3,$4,$5,true,1)',
        [id,staged.key,staged.sha256,staged.contentType,staged.bytes]);
      await admin.query('INSERT INTO ' + schema + '.gates(id) VALUES($1)', [id]);
    }
    // The gate rows must EXIST before they can be released. TUR056 does not
    // pause on the already-authorized SQL snapshot; it tests owner privileges.
    const release=await admin.query('UPDATE ' + schema + '.gates SET released=true');
    assert.equal(release.rowCount,ids.length);
    const gateRows=(await admin.query('SELECT released FROM ' + schema + '.gates')).rows;
    assert.equal(gateRows.length,ids.length);
    assert.ok(gateRows.every(row=>row.released===true));
    for (let i=0; i<roles.length; i++) {
      const link = new URL(URI);link.username=roles[i];link.password=passwords[i];
      const session = new pg.Client({connectionString:link.href});
      await session.connect();
      assert.equal((await session.query('SELECT session_user AS actor')).rows[0].actor, roles[i]);
      sessions.push(session);
    }
    const [reader,revoker,owner,outsider] = sessions;
    const rights = await admin.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles ' +
      'WHERE rolname=ANY($1::name[]) ORDER BY rolname', [roles]);
    assert.equal(rights.rowCount,4);
    assert.ok(rights.rows.every(x=>!x.rolsuper && !x.rolcreatedb && !x.rolcreaterole));
    assert.equal((await admin.query('SELECT pg_get_userbyid(relowner) AS owner FROM pg_class ' +
      'WHERE oid=$1::regclass', [schema+'.media'])).rows[0].owner, roles[2]);
    await assert.rejects(
      outsider.query('UPDATE '+schema+'.media SET approved=true WHERE id=$1',[ids[0]]),
      /permission denied/i
    );
    await assert.rejects(
      outsider.query('CREATE TABLE '+schema+'.outside_probe (n integer)'),
      /permission denied/i
    );
    await assert.rejects(reader.query('UPDATE ' + schema + '.media SET approved=false WHERE id=$1',[ids[0]]),/permission denied/i);

    server=spawn(process.execPath,[nextBin,'start','-H','127.0.0.1','-p','3131'],{
      cwd,env:{...process.env,
        CI:'true',TOPWHIZ_SYNTHETIC_API:'0',
        TOPWHIZ_CMS_API_BASE:'https://cms.ci.invalid/',
        TOPWHIZ_CMS_API_HOST:'cms.ci.invalid',
        TOPWHIZ_TUR041_REAL_NEXT_TEST:'1',
        TOPWHIZ_TUR041_SCHEMA:schema,
        TOPWHIZ_TUR041_READER:roles[0],
        TOPWHIZ_TUR041_PASSWORD:passwords[0],
        NODE_OPTIONS:'--import=' + preload
      },stdio:['ignore','pipe','pipe']});
    const record = data => { logs=(logs+String(data)).slice(-15000); };
    server.stdout?.on('data',record);
    server.stderr?.on('data',record);
    let ready = false;
    for(let attempt=0;attempt<140;attempt++){
      if(server.exitCode!==null)throw Error('Next server exited unexpectedly: '+logs.slice(-4000));
      try {
        const result=await fetch(origin+'/media/cms/not.valid',{signal:AbortSignal.timeout(700)});
        if(result.status===404){ready=true;await result.arrayBuffer();break;}
      }catch{}
      await wait(150);
    }
    assert.equal(ready,true,'Real Next production HTTP server failed to start: '+logs.slice(-4000));


    const asset=ids[0],url=origin+'/media/cms/'+asset;
    const read = async () => {
      const response=await fetch(url,{redirect:'error',cache:'no-store',
        signal:AbortSignal.timeout(12000)});
      return {status:response.status,
        cache:response.headers.get('cache-control'),
        body:Buffer.from(await response.arrayBuffer())};
    };
    const before=await read();
    assert.equal(before.status,200);
    assert.equal(before.cache,'no-store');
    assert.deepEqual(before.body,bytes);
    assert.equal((await admin.query('SELECT arrived,final_count FROM '+schema+
      '.gates WHERE id=$1',[asset])).rows[0].final_count,2);

    // The separately authenticated revoker can withdraw but cannot disable
    // the ownership-controlled trigger or restore approval.
    await revoker.query('BEGIN');
    try {
      const changed=await revoker.query('UPDATE '+schema+
        '.media SET approved=false,generation=2 '+
        'WHERE id=$1 AND approved=true AND generation=1',[asset]);
      assert.equal(changed.rowCount,1);
      await revoker.query('COMMIT');
    } catch (error) {
      await revoker.query('ROLLBACK').catch(()=>{});
      throw error;
    }
    const recorded=(await reader.query('SELECT approved,generation FROM '+schema+
      '.media WHERE id=$1',[asset])).rows[0];
    assert.deepEqual(recorded,{approved:false,generation:'2'});
    const denied=await read();
    assert.equal(denied.status,404);
    assert.equal(denied.body.length,0);

    // The outsider cannot write to the media table and owns no database
    // object. The separate ordinary owner creates a SECURITY DEFINER function
    // that re-approves without application review or canonical outbox receipt.
    const fn=schema+'.reapprove_via_definer(text)';
    await owner.query('CREATE FUNCTION '+schema+'.reapprove_via_definer(target text) RETURNS integer '+
      'LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,'+schema+',pg_temp '+
      'AS $body$ DECLARE affected integer; BEGIN '+
      'UPDATE '+schema+'.media SET approved=true,generation=generation+1 '+
      'WHERE id=target AND approved=false AND generation=2; '+
      'GET DIAGNOSTICS affected = ROW_COUNT; RETURN affected; END $body$');
    await owner.query('REVOKE ALL ON FUNCTION '+fn+' FROM PUBLIC');
    await assert.rejects(
      outsider.query('SELECT '+schema+'.reapprove_via_definer($1) AS changed',[asset]),
      /permission denied for function/i
    );
    await owner.query('GRANT EXECUTE ON FUNCTION '+fn+' TO '+roles[3]);
    assert.equal((await admin.query('SELECT has_function_privilege($1,$2,$3) AS allowed',
      [roles[3],fn,'EXECUTE'])).rows[0].allowed,true);
    assert.equal((await admin.query('SELECT prosecdef,pg_get_userbyid(proowner) AS owner,proconfig '+
      'FROM pg_proc WHERE oid=$1::regprocedure',[fn])).rows[0].prosecdef,true);

    // CREATE is now revoked from the untrusted *object owner*, not merely
    // PUBLIC. Existing function ownership and GRANT EXECUTE still persist.
    await admin.query('REVOKE CREATE ON SCHEMA '+schema+' FROM '+roles[2]);
    assert.equal((await admin.query('SELECT has_schema_privilege($1,$2,$3) AS allowed',
      [roles[2],schema,'CREATE'])).rows[0].allowed,false);
    await assert.rejects(
      owner.query('CREATE TABLE '+schema+'.after_revocation (n integer)'),
      /permission denied for schema/i
    );
    assert.equal((await admin.query('SELECT has_function_privilege($1,$2,$3) AS allowed',
      [roles[3],fn,'EXECUTE'])).rows[0].allowed,true);
    // Outsider calls the already-created DEFINER after CREATE was revoked.
    assert.equal((await outsider.query('SELECT '+schema+'.reapprove_via_definer($1) AS changed',
      [asset])).rows[0].changed,1);
    const tampered=(await reader.query('SELECT approved,generation FROM '+
      schema+'.media WHERE id=$1',[asset])).rows[0];
    assert.deepEqual(tampered,{approved:true,generation:'3'});
    const republished=await read();
    assert.equal(republished.status,200);
    assert.equal(republished.cache,'no-store');
    assert.deepEqual(republished.body,bytes);

    console.log(JSON.stringify({
      suite:'TUR060_REAL_NEXT_HTTP_PG16_SECDEF_CREATE_ACL_NEGATIVE',
      realNextProductionServer:true,actualCmsHandler:true,
      independentPasswordLogins:4,allRolesNonSuperuser:true,
      outsiderDirectUpdateDenied:true,
      securityDefinerOwnedByTableOwner:true,
      outsiderExecuteDeniedBeforeGrant:true,
      schemaCreateRevokedFromOwner:true,
      ownerNewCreateDenied:true,
      existingFunctionExecutePersists:true,
      actualNextInitialHttpStatus:before.status,
      afterDurableRevokeHttpStatus:denied.status,
      afterUntrustedDefinerCallHttpStatus:republished.status,
      afterUntrustedDefinerBytes:republished.body.length,
      sqliteOrSyntheticPostgres:false,pg16CommitAck:'CONFIRMED',
      inheritedUnknownCommitAck:'TUR030',
      productionNeonView:'NOT_RUN',productionOutbox:'NOT_RUN',
      externalOperatorIAM:'NOT_IMPLEMENTED',
      realR2CDN:'NOT_RUN',remoteReceiverLastByteAck:'NOT_PROVEN',
      originalSyntheticPngSha256:hash,issue22:'OPEN',
      historicalTUR018UnsafeFictionalBytes:99276,release:'NO_GO'
    }));
  } finally {
    if(server){
      server.kill('SIGTERM');
      for(let i=0;i<12&&server.exitCode===null;i++)await wait(150);
      if(server.exitCode===null)server.kill('SIGKILL');
    }
    for(const session of sessions) await session.end().catch(()=>{});
    if(connected){
      await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
      for(const role of roles.reverse())await admin.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
    }
    await admin.end().catch(()=>{});
  }
});
