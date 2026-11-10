import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { makeSyntheticPng } from './fixtures/png-factory.mjs';
import { stageLicensedMedia } from '../src/cms/cloudflare-adapters.mjs';

/** TUR062: real Next HTTP ignores independently owned PG16 guardian anchor,
 * distinct real PG16 reader/revoker logins and only synthetic in-memory R2.
 * This is a NEGATIVE regression, not a last-network-byte or CDN proof.
 */
const URI = process.env.TEST_DATABASE_URL;
if (process.env.CI !== 'true' || !URI ||
    !['127.0.0.1','localhost'].includes(new URL(URI).hostname))
  throw Error('TUR041 requires CI disposable localhost PostgreSQL16');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('TUR062: separate PG16 guardian revoke cannot fence real Next HTTP through mutable owner table', { timeout: 120000 }, async () => {
  const suffix = randomBytes(5).toString('hex');
  const schema = 'tw041_' + suffix;
  const guardianSchema = 'tw062_guard_' + suffix;
  const roles = [schema + '_reader', schema + '_revoker', schema + '_owner', schema + '_guardian'];
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
    // Administrative independence modeled as a SEPARATELY OWNED schema and
    // table, not as true external IAM. The media table owner gets read only.
    await admin.query('CREATE SCHEMA '+guardianSchema+' AUTHORIZATION '+roles[3]);
    await admin.query('CREATE TABLE '+guardianSchema+
      '.revocation_anchor (id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
    await admin.query('ALTER TABLE '+guardianSchema+'.revocation_anchor OWNER TO '+roles[3]);
    await admin.query('REVOKE ALL ON SCHEMA '+guardianSchema+' FROM PUBLIC');
    await admin.query('REVOKE ALL ON '+guardianSchema+'.revocation_anchor FROM PUBLIC');
    await admin.query('GRANT USAGE ON SCHEMA '+guardianSchema+' TO '+roles[0]+','+roles[2]);
    await admin.query('GRANT SELECT ON '+guardianSchema+'.revocation_anchor TO '+roles[0]+','+roles[2]);
    // In an isolated disposable PG16 schema, an ordinary SQL trigger rejects
    // reapproval (including by the trusted revoker). The separate TABLE OWNER
    // can nevertheless disable this trigger outside the application's CAS.
    await admin.query('CREATE FUNCTION ' + schema + '.deny_reapproval() RETURNS trigger ' +
      'LANGUAGE plpgsql AS ' + String.fromCharCode(36,36) +
      " BEGIN IF OLD.approved IS FALSE AND NEW.approved IS TRUE " +
      "THEN RAISE EXCEPTION 'reapproval_forbidden'; END IF; RETURN NEW; END " +
      String.fromCharCode(36,36));
    await admin.query('CREATE TRIGGER rights_guard BEFORE UPDATE OF approved ON ' +
      schema + '.media FOR EACH ROW EXECUTE FUNCTION ' + schema + '.deny_reapproval()');
    await admin.query('ALTER TABLE ' + schema + '.media OWNER TO ' + roles[2]);
    // TUR041 CI-only preload records final SQL reads in gates. For this test
    // release is always granted, because the threat is owner privilege, not
    // the earlier already-admitted HTTP buffering race.
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
      await admin.query('INSERT INTO '+guardianSchema+
        '.revocation_anchor(id,approved,generation) VALUES($1,true,1)',[id]);
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
    const [reader,revoker,owner,guardian] = sessions;
    const rights = await admin.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles ' +
      'WHERE rolname=ANY($1::name[]) ORDER BY rolname', [roles]);
    assert.equal(rights.rowCount,4);
    assert.ok(rights.rows.every(x=>!x.rolsuper && !x.rolcreatedb && !x.rolcreaterole));
    assert.equal((await admin.query('SELECT pg_get_userbyid(relowner) AS owner FROM pg_class ' +
      'WHERE oid=$1::regclass', [schema+'.media'])).rows[0].owner, roles[2]);
    await assert.rejects(
      revoker.query('ALTER TABLE '+schema+'.media DISABLE TRIGGER rights_guard'),
      /must be owner|permission denied/i
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
    // Guardian is independent from mutable media object ownership.
    assert.equal((await admin.query(
      'SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid=$1::regclass',
      [guardianSchema+'.revocation_anchor'])).rows[0].owner,roles[3]);
    await assert.rejects(
      guardian.query('UPDATE '+schema+'.media SET approved=false WHERE id=$1',[asset]),
      /permission denied/i);
    await assert.rejects(
      owner.query('UPDATE '+guardianSchema+
        '.revocation_anchor SET approved=false WHERE id=$1',[asset]),
      /permission denied/i);
    const before=await read();
    assert.equal(before.status,200);
    assert.equal(before.cache,'no-store');
    assert.deepEqual(before.body,bytes);
    assert.equal((await admin.query('SELECT arrived,final_count FROM '+schema+
      '.gates WHERE id=$1',[asset])).rows[0].final_count,2);

    // An independent guardian commits the revocation anchor FIRST. The actual
    // Next/CMS handler does not consume that independent table: negative case.
    await guardian.query('BEGIN');
    try {
      const withdrawal=await guardian.query('UPDATE '+guardianSchema+
        '.revocation_anchor SET approved=false,generation=2 '+
        'WHERE id=$1 AND approved=true AND generation=1',[asset]);
      assert.equal(withdrawal.rowCount,1);
      await guardian.query('COMMIT');
    } catch(error){await guardian.query('ROLLBACK').catch(()=>{});throw error;}
    const anchorAfterRevoke=(await reader.query('SELECT approved,generation FROM '+
      guardianSchema+'.revocation_anchor WHERE id=$1',[asset])).rows[0];
    assert.deepEqual(anchorAfterRevoke,{approved:false,generation:'2'});
    const guardianOnlyRevokeHttp=await read();
    assert.equal(guardianOnlyRevokeHttp.status,200,
      'real Next HTTP still trusts the media owner snapshot, ignoring separate guardian');
    assert.deepEqual(guardianOnlyRevokeHttp.body,bytes);
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

    await assert.rejects(
      revoker.query('UPDATE '+schema+'.media '+
        'SET approved=true,generation=3 WHERE id=$1',[asset]),
      /reapproval_forbidden/i
    );
    // Even the owner cannot reapprove WHILE the trigger is enabled.
    await assert.rejects(
      owner.query('UPDATE '+schema+'.media '+
        'SET approved=true,generation=3 WHERE id=$1',[asset]),
      /reapproval_forbidden/i
    );
    assert.deepEqual((await reader.query('SELECT approved,generation FROM '+
      schema+'.media WHERE id=$1',[asset])).rows[0],
      {approved:false,generation:'2'});

    // A properly scoped owner SECURITY DEFINER does not gain access to an
    // independently owned guardian table; CREATE is later revoked as well.
    await admin.query('GRANT CREATE ON SCHEMA '+schema+' TO '+roles[2]);
    await owner.query('CREATE FUNCTION '+schema+'.tamper_guardian() RETURNS integer '+
      'LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,'+schema+',pg_temp '+
      'AS $body$ BEGIN UPDATE '+guardianSchema+
      ".revocation_anchor SET approved=true,generation=3 WHERE id='tur041-a'; "+
      'RETURN 1; END $body
    // superuser. It disables the mutation trigger, reapproves, then commits.
    // No app-authorized review, outbox publication or IAM approval exists.
    await owner.query('BEGIN');
    try {
      await owner.query('ALTER TABLE '+schema+'.media DISABLE TRIGGER rights_guard');
      const bypass=await owner.query('UPDATE '+schema+'.media '+
        'SET approved=true,generation=3 WHERE id=$1 AND approved=false AND generation=2',
        [asset]);
      assert.equal(bypass.rowCount,1);
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK').catch(()=>{});
      throw error;
    }
    const tampered=(await reader.query('SELECT approved,generation FROM '+
      schema+'.media WHERE id=$1',[asset])).rows[0];
    assert.deepEqual(tampered,{approved:true,generation:'3'});
    const republished=await read();
    assert.equal(republished.status,200);
    assert.equal(republished.cache,'no-store');
    assert.deepEqual(republished.body,bytes);

    assert.deepEqual((await reader.query('SELECT approved,generation FROM '+
      guardianSchema+'.revocation_anchor WHERE id=$1',[asset])).rows[0],
      {approved:false,generation:'2'});
    console.log(JSON.stringify({
      suite:'TUR062_REAL_NEXT_HTTP_PG16_SEPARATE_GUARDIAN_NEGATIVE',
      twoIndependentlyOwnedPG16Tables:true,
      separateGuardianRoleNonSuperuser:true,
      guardianCannotAlterMedia:true,mediaOwnerCannotAlterGuardian:true,
      ownerSECURITY_DEFINERCannotAlterGuardian:true,
      ownerSchemaCREATERevoked:true,
      guardianOnlyRevokeHttpStatus:guardianOnlyRevokeHttp.status,
      guardianStillRevokedAfterOwnerBypass:true,
      realNextProductionServer:true,realNextHttpListener:'127.0.0.1:3131',
      actualCmsHandler:true,independentPasswordLogins:3,
      ownerNoSuperuserOrCreateRoles:true,revokerCannotAlterTrigger:true,
      reapprovalTriggerBeforeOwnerChange:'ENFORCED',
      ownerDisabledTrigger:true,
      initialHttpStatus:before.status,postRevokeHttpStatus:denied.status,
      afterOwnerBypassHttpStatus:republished.status,
      afterOwnerBypassBytes:republished.body.length,
      genuinePg16CommitConfirmed:true,unknownCommitAck:'INHERITED_TUR030',
      actualProductionNeonSecurityBarrier:'NOT_RUN',
      actualProductionOutbox:'NOT_RUN',externalIAM:'NOT_IMPLEMENTED',
      liveR2Cdn:'NOT_RUN',lastWireByteAck:'NOT_PROVEN',
      sha256OriginalPng:hash,issue22:'OPEN',release:'NO_GO',
      tur018HistoricalUnsafeFictionalBytes:99276
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
      await admin.query('DROP SCHEMA IF EXISTS '+guardianSchema+' CASCADE').catch(()=>{});
      for(const role of roles.reverse())await admin.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
    }
    await admin.end().catch(()=>{});
  }
});
);
    await admin.query('REVOKE CREATE ON SCHEMA '+schema+' FROM '+roles[2]);
    assert.equal((await admin.query('SELECT has_schema_privilege($1,$2,$3) AS allowed',
      [roles[2],schema,'CREATE'])).rows[0].allowed,false);
    await assert.rejects(
      owner.query('SELECT '+schema+'.tamper_guardian()'),
      /permission denied for table revocation_anchor/i);
    assert.deepEqual((await reader.query('SELECT approved,generation FROM '+
      guardianSchema+'.revocation_anchor WHERE id=$1',[asset])).rows[0],
      {approved:false,generation:'2'});
    // This is an independent password LOGIN with table ownership, not
    // superuser. It disables the mutation trigger, reapproves, then commits.
    // No app-authorized review, outbox publication or IAM approval exists.
    await owner.query('BEGIN');
    try {
      await owner.query('ALTER TABLE '+schema+'.media DISABLE TRIGGER rights_guard');
      const bypass=await owner.query('UPDATE '+schema+'.media '+
        'SET approved=true,generation=3 WHERE id=$1 AND approved=false AND generation=2',
        [asset]);
      assert.equal(bypass.rowCount,1);
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK').catch(()=>{});
      throw error;
    }
    const tampered=(await reader.query('SELECT approved,generation FROM '+
      schema+'.media WHERE id=$1',[asset])).rows[0];
    assert.deepEqual(tampered,{approved:true,generation:'3'});
    const republished=await read();
    assert.equal(republished.status,200);
    assert.equal(republished.cache,'no-store');
    assert.deepEqual(republished.body,bytes);

    console.log(JSON.stringify({
      suite:'TUR056_REAL_NEXT_HTTP_PG16_OWNER_TRIGGER_BYPASS_NEGATIVE',
      realNextProductionServer:true,realNextHttpListener:'127.0.0.1:3131',
      actualCmsHandler:true,independentPasswordLogins:3,
      ownerNoSuperuserOrCreateRoles:true,revokerCannotAlterTrigger:true,
      reapprovalTriggerBeforeOwnerChange:'ENFORCED',
      ownerDisabledTrigger:true,
      initialHttpStatus:before.status,postRevokeHttpStatus:denied.status,
      afterOwnerBypassHttpStatus:republished.status,
      afterOwnerBypassBytes:republished.body.length,
      genuinePg16CommitConfirmed:true,unknownCommitAck:'INHERITED_TUR030',
      actualProductionNeonSecurityBarrier:'NOT_RUN',
      actualProductionOutbox:'NOT_RUN',externalIAM:'NOT_IMPLEMENTED',
      liveR2Cdn:'NOT_RUN',lastWireByteAck:'NOT_PROVEN',
      sha256OriginalPng:hash,issue22:'OPEN',release:'NO_GO',
      tur018HistoricalUnsafeFictionalBytes:99276
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
