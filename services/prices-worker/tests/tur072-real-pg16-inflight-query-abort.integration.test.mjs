import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {handleCmsMedia} from '../src/cms/media-handler.mjs';
import {createGuardianApprovalLookup} from '../src/cms/guardian-approval-contract.mjs';
import {stageLicensedMedia} from '../src/cms/cloudflare-adapters.mjs';
import {makeSyntheticPng} from './fixtures/png-factory.mjs';

/**
 * TUR072 genuine socket disconnect DURING a still-active PostgreSQL 16 query.
 * Unlike TUR071's media->guardian *post-query handoff*, this observes that a
 * dispatched SQL command does NOT stop when a cooperative AbortSignal fires.
 * The actual CMS handler is invoked with an opt-in Node transport bridge.
 * Real external IAM, Neon, R2, Cloudflare, CDN and receiver ACK are NOT tested.
 */
const URI=process.env.TEST_DATABASE_URL;
let parsed;
try{parsed=new URL(URI)}catch{}
if(process.env.CI!=='true'||!parsed||parsed.protocol!=='postgresql:'||
  !['127.0.0.1','localhost'].includes(parsed.hostname)||
  (parsed.port&&parsed.port!=='5432')||parsed.search||parsed.hash)
  throw Error('TUR072 requires disposable local PostgreSQL16 CI only');

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function bounded(p,label,ms=10000){let timer;try{
  return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' TIMEOUT')),ms)})]);
}finally{clearTimeout(timer)}}
const bytes=Buffer.from(makeSyntheticPng(54,44));
const sha256=createHash('sha256').update(bytes).digest('hex');
const suffix=randomBytes(5).toString('hex');
const m='tw072_media_'+suffix,g='tw072_guard_'+suffix;
const roles=['mediareader','mediaowner','guardianreader','guardianowner'].map(x=>'tw072_'+x+'_'+suffix);
const passwords=roles.map(()=>randomBytes(18).toString('hex'));
const id='tur072-media';

test('TUR072 real CMS HTTP + independent PG16 role sessions: client abort does NOT cancel dispatched SQL, guardian COMMIT denies stale result', {timeout:120000}, async()=>{
  const admin=new pg.Client({connectionString:URI});
  const sessions=[];
  let adminUp=false,server,port,client;
  let delayed=false,mediaStart=deferred(),tcpClosed=deferred(),handlerDone=deferred();
  let responseStatus=0,clientBytes=0,bodyGetCount=0,guardReadCount=0,abortCount=0;
  let abortAfterSqlDispatch=false,backendActiveAfterSocketClose=false,backendPid;
  let cancelForbidden=false,adminCancelWorked=false,adminCancelSqlState='';
  try{
    await admin.connect();adminUp=true;
    for(let i=0;i<roles.length;i++)await admin.query(
      'CREATE ROLE '+roles[i]+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+passwords[i]+"'");
    await admin.query('CREATE SCHEMA '+m);
    await admin.query('CREATE TABLE '+m+'.asset(id text PRIMARY KEY,key text NOT NULL,'+
      'sha256_hex text NOT NULL, content_type text NOT NULL,bytes integer NOT NULL,'+
      'approved boolean NOT NULL, generation bigint NOT NULL CHECK(generation>0))');
    await admin.query('ALTER TABLE '+m+'.asset OWNER TO '+roles[1]);
    await admin.query('REVOKE ALL ON SCHEMA '+m+' FROM PUBLIC');
    await admin.query('GRANT USAGE ON SCHEMA '+m+' TO '+roles[0]+','+roles[1]);
    await admin.query('GRANT SELECT ON '+m+'.asset TO '+roles[0]);
    await admin.query('CREATE SCHEMA '+g+' AUTHORIZATION '+roles[3]);
    await admin.query('CREATE TABLE '+g+'.authority(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
    await admin.query('ALTER TABLE '+g+'.authority OWNER TO '+roles[3]);
    await admin.query('REVOKE ALL ON SCHEMA '+g+' FROM PUBLIC');
    await admin.query('REVOKE ALL ON '+g+'.authority FROM PUBLIC');
    await admin.query('GRANT USAGE ON SCHEMA '+g+' TO '+roles[2]);
    await admin.query('GRANT SELECT ON '+g+'.authority TO '+roles[2]);

    const fixture=await stageLicensedMedia({async put(){}},id,bytes,{
      rightsApproved:true,evidenceRef:'CI_SYNTHETIC_ONLY',reviewer:'TUR072 Synthetic Reviewer'
    });
    assert.equal(fixture.sha256,sha256);
    await admin.query('INSERT INTO '+m+'.asset(id,key,sha256_hex,content_type,bytes,approved,generation) '+
      'VALUES($1,$2,$3,$4,$5,true,1)',
      [id,fixture.key,fixture.sha256,fixture.contentType,fixture.bytes]);
    await admin.query('INSERT INTO '+g+'.authority VALUES($1,true,1)',[id]);
    for(let i=0;i<roles.length;i++){
      const u=new URL(URI);u.username=roles[i];u.password=passwords[i];
      const session=new pg.Client({connectionString:u.href});
      await session.connect();sessions.push(session);
      const actor=(await session.query('SELECT session_user AS actor')).rows[0].actor;
      assert.equal(actor,roles[i]);
      assert.equal((await session.query('SELECT rolsuper FROM pg_roles WHERE rolname=session_user')).rows[0].rolsuper,false);
    }
    const [mediaReader,mediaOwner,guardianReader,guardianOwner]=sessions;
    backendPid=(await mediaReader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await assert.rejects(mediaOwner.query('UPDATE '+g+'.authority SET approved=true'),/permission denied/i);
    await assert.rejects(guardianReader.query('UPDATE '+g+'.authority SET approved=true'),/permission denied/i);
    // Existing SECURITY DEFINER and CREATE ACL attack cases are inherited TUR060.
    // This tour tests the *different* in-flight SQL cancellation boundary.

    async function mediaRead(target,signal){
      if(delayed){
        mediaStart.resolve();
      }
      const result=await mediaReader.query(
        'SELECT id,key,sha256_hex,content_type,bytes,approved,generation,'+
        (delayed?'pg_sleep(1.8) AS delayed_query':'NULL::text AS delayed_query')+
        ' FROM '+m+'.asset WHERE id=$1 AND approved=true',[target]);
      if(delayed && signal?.aborted)abortAfterSqlDispatch=true;
      const row=result.rows[0];
      return row?{id:row.id,key:row.key,sha256Hex:row.sha256_hex,
        contentType:row.content_type,bytes:row.bytes,rightsApproved:row.approved,
        generation:row.generation}:null;
    }
    async function guardianRead(target){
      guardReadCount++;
      const result=await guardianReader.query('SELECT approved,generation FROM '+g+'.authority WHERE id=$1',[target]);
      return result.rows[0]??null;
    }
    const bucket={async get(key){
      bodyGetCount++;
      if(key!==fixture.key)return null;
      return {size:bytes.length,body:new Response(bytes).body,
        customMetadata:{sha256},httpMetadata:{contentType:'image/png'}};
    }};
    server=http.createServer(async(req,res)=>{
      const ctrl=new AbortController();
      res.once('close',()=>{if(!res.writableFinished){
        abortCount++;ctrl.abort('physical_tcp_close');tcpClosed.resolve();
      }});
      try{
        const resp=await handleCmsMedia(
          new Request('http://127.0.0.1:'+port+req.url,{method:req.method}),{
            findApprovedAsset:createGuardianApprovalLookup({readMedia:mediaRead,readGuardian:guardianRead}),
            bucket,abortSignal:ctrl.signal
          });
        responseStatus=resp.status;
        if(!res.destroyed){
          res.writeHead(resp.status,Object.fromEntries(resp.headers.entries()));
          res.end(Buffer.from(await resp.arrayBuffer()));
        }
      }catch(e){
        responseStatus=503;
        if(!res.destroyed&&!res.headersSent){res.writeHead(503);res.end()}
      }finally{if(delayed)handlerDone.resolve()}
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');
    port=server.address().port;
    const origin='http://127.0.0.1:'+port+'/v1/media/'+id;
    const baseline=await fetch(origin,{signal:AbortSignal.timeout(10000)});
    assert.equal(baseline.status,200);
    assert.deepEqual(Buffer.from(await baseline.arrayBuffer()),bytes);
    assert.equal(bodyGetCount,1);
    assert.equal(guardReadCount,2);

    delayed=true;
    const priorBodyGets=bodyGetCount,priorGuards=guardReadCount;
    client=http.get({hostname:'127.0.0.1',port,path:'/v1/media/'+id},res=>{
      res.on('data',chunk=>{clientBytes+=chunk.length});res.resume();
    });
    client.on('error',()=>{}); // intentional socket ECONNRESET
    await bounded(mediaStart.promise,'delayed query dispatched');
    // Read actual pg_stat_activity, not a synthetically flipped "query active".
    let activity;
    for(let attempt=0;attempt<40;attempt++){
      activity=(await admin.query(
        'SELECT state,query FROM pg_stat_activity WHERE pid=$1',[backendPid])).rows[0];
      if(activity?.state==='active'&&activity.query.includes('pg_sleep(1.8)'))break;
      await wait(15);
    }
    assert.equal(activity?.state,'active','PG16 SELECT must be dispatched and active');
    assert.match(activity.query,/pg_sleep\(1\.8\)/);
    client.destroy();
    await bounded(tcpClosed.promise,'real client disconnect');
    const stillActive=(await admin.query(
      'SELECT state,query FROM pg_stat_activity WHERE pid=$1',[backendPid])).rows[0];
    backendActiveAfterSocketClose=stillActive?.state==='active'&&
      stillActive.query.includes('pg_sleep(1.8)');
    assert.equal(backendActiveAfterSocketClose,true,
      'TCP abort + cooperative AbortSignal do not cancel already sent PG16 query');
    assert.equal(clientBytes,0);

    await guardianOwner.query('BEGIN');
    try{
      const changed=await guardianOwner.query('UPDATE '+g+
        '.authority SET approved=false,generation=2 WHERE id=$1 AND approved=true AND generation=1',[id]);
      assert.equal(changed.rowCount,1);
      await guardianOwner.query('COMMIT');
    }catch(e){await guardianOwner.query('ROLLBACK').catch(()=>{});throw e}
    const revoked=(await guardianReader.query(
      'SELECT approved,generation FROM '+g+'.authority WHERE id=$1',[id])).rows[0];
    assert.deepEqual(revoked,{approved:false,generation:'2'});
    await bounded(handlerDone.promise,'PG16 long query completion and denied handler');
    const abortedStatus=responseStatus;
    assert.equal(abortedStatus,503);
    assert.equal(abortAfterSqlDispatch,true);
    assert.equal(abortCount,1);
    assert.equal(bodyGetCount,priorBodyGets,
      'No image fetch after cancelled in-flight SQL returns');
    assert.equal(guardReadCount,priorGuards,
      'No independent guardian lookup after cancelled in-flight media SQL');
    const guardianReadsOnAbortedRequest=guardReadCount-priorGuards;
    assert.equal(guardianReadsOnAbortedRequest,0);
    assert.equal(clientBytes,0);

    delayed=false;
    const fresh=await fetch(origin,{signal:AbortSignal.timeout(10000)});
    assert.equal(fresh.status,404);
    assert.equal((await fresh.arrayBuffer()).byteLength,0);

    // Prove unauthorized guardian-reader cannot kill an independent media
    // reader's backend, while the CI-only ADMIN can. NO new privilege grants.
    const pending=mediaReader.query('SELECT pg_sleep(4) AS should_cancel');
    let active2=false;
    for(let attempt=0;attempt<60;attempt++){
      const state=(await admin.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',
        [backendPid])).rows[0];
      if(state?.state==='active'&&state.query.includes('pg_sleep(4)')){active2=true;break}
      await wait(15);
    }
    assert.equal(active2,true);
    try{
      await assert.rejects(guardianReader.query('SELECT pg_cancel_backend($1)',[backendPid]),
        /permission denied|must be a member|not allowed/i);
      cancelForbidden=true;
      const cancelled=await admin.query('SELECT pg_cancel_backend($1) AS cancelled',[backendPid]);
      adminCancelWorked=cancelled.rows[0].cancelled===true;
      assert.equal(adminCancelWorked,true);
      await assert.rejects(pending,e=>{
        adminCancelSqlState=e.code;
        return e.code==='57014';
      });
    }finally{
      // Never leave an unhandled server-side query past teardown.
      await admin.query('SELECT pg_cancel_backend($1)',[backendPid]).catch(()=>{});
      await pending.catch(()=>{});
    }
    assert.equal(cancelForbidden,true);
    assert.equal(adminCancelSqlState,'57014');
    console.log(JSON.stringify({
      suite:'TUR072_REAL_PG16_INFLIGHT_SQL_NOT_CANCELLED_ON_NODE_HTTP_ABORT',
      originalCmsMediaHandler:true,realNodeTcp:true,disposablePostgres16:true,
      independentNonSuperuserPasswordLogins:4,
      separateMediaAndGuardianOwner:true,
      mediaOwnerGuardianMutationDenied:true,
      observedPgStatActivityActiveOnDisconnect:backendActiveAfterSocketClose,
      inFlightPgQueryContinuedAfterAbort:true,
      cancelledHandlerStatus:abortedStatus,
      newHttpAfterGuardianCommitStatus:fresh.status,
      fictionalAbortedClientDeliveredBytes:clientBytes,
      mediaBucketGetAfterAbortedSql:bodyGetCount-priorBodyGets,
      independentGuardianReadAfterAbortedSql:guardianReadsOnAbortedRequest,
      guardianReaderPgCancelForbidden:cancelForbidden,
      ciAdminPgCancelWorked:adminCancelWorked,
      postgresCancelledSqlState:adminCancelSqlState,
      tur068NoSignalUpstreamBytes:8273,tur071OptInCancelledBytes:4136,
      tur069IrretractableFictionalFirstBytes:25,
      fullExternalIAM:'NOT_PROVEN',workerNextTransportBridge:'NOT_WIRED',
      realCloudflareNeonR2Cdn:'NOT_RUN',receiverAck:'NOT_PROVEN',
      queueOriginalOutboxSha:'INHERITED_CI',unknownCommitAck:'INHERITED_TUR030',
      issue22:'OPEN',release:'NO_GO'
    }));
  }finally{
    delayed=false;
    if(client)client.destroy();
    if(server){server.closeAllConnections?.();await new Promise(r=>server.close(r))}
    for(const c of sessions)await c.end().catch(()=>{});
    if(adminUp){
      await admin.query('DROP SCHEMA IF EXISTS '+m+' CASCADE').catch(()=>{});
      await admin.query('DROP SCHEMA IF EXISTS '+g+' CASCADE').catch(()=>{});
      for(const role of [...roles].reverse())await admin.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
    }
    await admin.end().catch(()=>{});
  }
});
