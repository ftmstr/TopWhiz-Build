import test from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { makeSyntheticPng } from './fixtures/png-factory.mjs';
import { stageLicensedMedia } from '../src/cms/cloudflare-adapters.mjs';

/** TUR053: genuine Next.js production HTTP disconnect and actual CMS handler,
 * distinct real PG16 reader/revoker logins and only synthetic in-memory R2.
 * This is a NEGATIVE regression, not a last-network-byte or CDN proof.
 */
const URI = process.env.TEST_DATABASE_URL;
if (process.env.CI !== 'true' || !URI ||
    !['127.0.0.1','localhost'].includes(new URL(URI).hostname))
  throw Error('TUR041 requires CI disposable localhost PostgreSQL16');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('TUR053: real Next aborts one admitted TCP client while sibling survives PG16 rights COMMIT', { timeout: 120000 }, async () => {
  const suffix = randomBytes(5).toString('hex');
  const schema = 'tw041_' + suffix;
  const roles = [schema + '_reader', schema + '_revoker'];
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
    for (let i=0; i<roles.length; i++) {
      const link = new URL(URI);link.username=roles[i];link.password=passwords[i];
      const session = new pg.Client({connectionString:link.href});
      await session.connect();
      assert.equal((await session.query('SELECT session_user AS actor')).rows[0].actor, roles[i]);
      sessions.push(session);
    }
    const [reader,revoker] = sessions;
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

    // Two actual loopback TCP requests enter the genuine Next App Router and CMS.
    // The first deliberately destroys its Node HTTP client socket BEFORE any
    // response headers, while the second remains open through rights COMMIT.
    const abandoned = httpRequest(origin+'/media/cms/'+ids[0],{
      method:'GET',agent:false,headers:{Accept:'image/png'}
    });
    let abandonedBytes=0;
    let abandonedHeaders=false;
    let abandonedClosed=false;
    const abandonedClose=new Promise<void>(resolve=>{
      abandoned.on('response',response=>{
        abandonedHeaders=true;
        response.on('data',chunk=>{abandonedBytes+=Buffer.byteLength(chunk);});
        response.on('error',()=>{});
        response.resume();
      });
      abandoned.on('error',()=>{}); // intentional client cancellation
      abandoned.on('close',()=>{abandonedClosed=true;resolve();});
    });
    abandoned.end();
    const surviving=fetch(origin+'/media/cms/'+ids[1],{
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)
    }).then(async response=>({
      status:response.status,
      cache:response.headers.get('cache-control'),
      body:Buffer.from(await response.arrayBuffer())
    }));
    let arrived=false;
    for(let attempt=0;attempt<220;attempt++){
      const rows=(await admin.query('SELECT id,arrived,final_count FROM '+schema+'.gates ORDER BY id')).rows;
      if(rows.length===2 && rows.every(r=>r.arrived===true && r.final_count===2)){
        arrived=true;break;
      }
      await wait(40);
    }
    assert.equal(arrived,true,'Both real Next/CMS final SQL selects must be observed before COMMIT');
    // A local TCP close proves only the client-side connection lifecycle,
    // NOT that the remote Next process processed cancellation or stopped its
    // already approved CMS work. This is intentionally before revoke COMMIT.
    abandoned.destroy(new Error('TUR053 deliberate client TCP disconnect'));
    await abandonedClose;
    assert.equal(abandonedClosed,true);
    assert.equal(abandonedHeaders,false,'the test must abort before 200 headers');
    assert.equal(abandonedBytes,0,'abandoned client must not receive body bytes');


    await revoker.query('BEGIN');
    try{
      const changed=await revoker.query('UPDATE '+schema+
        '.media SET approved=false,generation=generation+1 WHERE id=ANY($1::text[]) AND approved=true AND generation=1',[ids]);
      assert.equal(changed.rowCount,2);
      const released=await revoker.query('UPDATE '+schema+
        '.gates SET released=true WHERE id=ANY($1::text[])',[ids]);
      assert.equal(released.rowCount,2);
      await revoker.query('COMMIT');
    }catch(e){await revoker.query('ROLLBACK').catch(()=>{});throw e;}
    const durable=(await admin.query('SELECT approved,generation FROM '+schema+'.media ORDER BY id')).rows;
    assert.ok(durable.every(x=>x.approved===false && x.generation==='2'));
    const old=await surviving;
    assert.equal(old.status,200);
    assert.equal(old.cache,'no-store');
    assert.deepEqual(old.body,bytes,
      'surviving client still receives previously approved bytes AFTER durable revoke');
    for(const id of ids){
      const res=await fetch(origin+'/media/cms/'+id,{signal:AbortSignal.timeout(10000)});
      assert.equal(res.status,404);
      assert.equal((await res.arrayBuffer()).byteLength,0);
    }
    console.log(JSON.stringify({
      suite:'TUR053_REAL_NEXT_TCP_ABORT_PG16_NEGATIVE',
      realNextProductionServer:true,realNextHttpListener:'127.0.0.1:3131',
      actualCmsHandler:true,independentPasswordLoginRoles:2,
      originalValidPngSha256:hash,concurrentAdmittedReads:2,clientTcpDestroyedBeforeCommit:true,
      abandonedClientHeaders:abandonedHeaders,abandonedClientBytes:abandonedBytes,
      serverObservedCancellation:'NOT_PROVEN',
      pg16DurableRevoke:true,postCommitSurvivorHttpClientBytes:old.body.length,
      durableCommitAck:'CONFIRMED',lostCommitAck:'INHERITED_TUR030_NOT_REPRODUCED',
      newPostCommitRequestsDenied:true,productionNeonView:'NOT_RUN',
      liveCloudflareR2Cdn:'NOT_RUN',lastNetworkByteAck:'NOT_PROVEN',
      independentOwnerIAM:'NOT_IMPLEMENTED',issue22:'OPEN',
      inheritedTUR018NegativeBytes:99276,release:'NO_GO'
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
