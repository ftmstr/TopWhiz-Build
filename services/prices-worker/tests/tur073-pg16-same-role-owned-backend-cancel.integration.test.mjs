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
 * TUR073 — actual PG16 least-privileged query cancellation with a second
 * authentication session of the SAME non-superuser reader role. No global
 * pg_signal_backend, no superuser, no guardian-owner authority granted.
 * One HTTP request owns a dedicated media SQL session (no pooling/reuse).
 * A test-only Node HTTP adapter maps physical socket loss -> AbortController
 * and invokes a pinned backend PID cancellation. This is not production IAM.
 */
const URL_ENV=process.env.TEST_DATABASE_URL;
let uri;
try{uri=new URL(URL_ENV)}catch{}
if(process.env.CI!=='true'||!uri||uri.protocol!=='postgresql:'||
 !['127.0.0.1','localhost'].includes(uri.hostname)||
 (uri.port&&uri.port!=='5432')||uri.search||uri.hash)
  throw Error('TUR073: disposable localhost PostgreSQL16 CI required');
const bytes=Buffer.from(makeSyntheticPng(54,44));
const sha=createHash('sha256').update(bytes).digest('hex');
const suffix=randomBytes(5).toString('hex');
const mediaSchema='tw073_m_'+suffix,guardSchema='tw073_g_'+suffix;
const roles=['media_reader','media_owner','guard_reader','guard_owner'].map(v=>'tw073_'+v+'_'+suffix);
const pass=roles.map(()=>randomBytes(20).toString('hex'));
const mediaId='tur073-media';
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function withLimit(p,label,ms=14000){let timer;try{
 return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timeout')),ms)})]);
}finally{clearTimeout(timer)}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('TUR073 real PG16: HTTP disconnect cancels ONLY dedicated same-role query, guardian remains independently authoritative',{
 timeout:120000
},async()=>{
 const admin=new pg.Client({connectionString:URL_ENV}),sessions=[];
 let connected=false,server,port,client;
 const started=gate(),closed=gate(),cancelDone=gate(),handlerDone=gate();
 let delayRead=false,activeBeforeAbort=false,abortCount=0,cancelAck=false,cancelError=null,
     sqlCancelCode=null,handlerStatus=null,clientBytes=0,readBucketCount=0,guardReads=0,
     targetPid=null,siblingPid=null,forbiddenCrossRoleCancel=false,mediaSessionRecovered=false;
 try{
  await admin.connect();connected=true;
  for(let i=0;i<roles.length;i++)await admin.query(
    'CREATE ROLE '+roles[i]+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+pass[i]+"'");
  await admin.query('CREATE SCHEMA '+mediaSchema);
  await admin.query('CREATE TABLE '+mediaSchema+'.asset(id text PRIMARY KEY,key text NOT NULL,'+
    'sha256_hex text NOT NULL,content_type text NOT NULL,bytes integer NOT NULL,'+
    'approved boolean NOT NULL,generation bigint NOT NULL)');
  await admin.query('ALTER TABLE '+mediaSchema+'.asset OWNER TO '+roles[1]);
  await admin.query('REVOKE ALL ON SCHEMA '+mediaSchema+' FROM PUBLIC');
  await admin.query('GRANT USAGE ON SCHEMA '+mediaSchema+' TO '+roles[0]);
  await admin.query('GRANT SELECT ON '+mediaSchema+'.asset TO '+roles[0]);
  await admin.query('CREATE SCHEMA '+guardSchema+' AUTHORIZATION '+roles[3]);
  await admin.query('CREATE TABLE '+guardSchema+'.anchor(id text PRIMARY KEY,'+
    'approved boolean NOT NULL,generation bigint NOT NULL)');
  await admin.query('ALTER TABLE '+guardSchema+'.anchor OWNER TO '+roles[3]);
  await admin.query('REVOKE ALL ON SCHEMA '+guardSchema+' FROM PUBLIC');
  await admin.query('REVOKE ALL ON '+guardSchema+'.anchor FROM PUBLIC');
  await admin.query('GRANT USAGE ON SCHEMA '+guardSchema+' TO '+roles[2]);
  await admin.query('GRANT SELECT ON '+guardSchema+'.anchor TO '+roles[2]);
  const staged=await stageLicensedMedia({async put(){}},mediaId,bytes,{
    rightsApproved:true,evidenceRef:'CI_ORIGINAL_FICTIONAL_IMAGE',
    reviewer:'TUR073 synthetic test only'
  });
  assert.equal(staged.sha256,sha);
  await admin.query('INSERT INTO '+mediaSchema+
    '.asset VALUES($1,$2,$3,$4,$5,true,1)',[
    mediaId,staged.key,staged.sha256,staged.contentType,staged.bytes]);
  await admin.query('INSERT INTO '+guardSchema+'.anchor VALUES($1,true,1)',[mediaId]);

  async function login(index){
    const u=new URL(URL_ENV);u.username=roles[index];u.password=pass[index];
    const client=new pg.Client({connectionString:u.href});await client.connect();
    sessions.push(client);
    const actor=(await client.query('SELECT session_user,rolsuper,rolcreaterole,'+
      "pg_has_role(session_user,'pg_signal_backend','member') AS signal_member "+
      'FROM pg_roles WHERE rolname=session_user')).rows[0];
    assert.equal(actor.session_user,roles[index]);
    assert.equal(actor.rolsuper,false);assert.equal(actor.rolcreaterole,false);
    assert.equal(actor.signal_member,false,'no broad pg_signal_backend grant');
    return client;
  }
  const mediaReader=await login(0), mediaCanceller=await login(0),
        siblingReader=await login(0), mediaOwner=await login(1),
        guardReader=await login(2),guardOwner=await login(3);
  targetPid=(await mediaReader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  siblingPid=(await siblingReader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  assert.notEqual(targetPid,siblingPid);
  await assert.rejects(mediaOwner.query('UPDATE '+guardSchema+'.anchor SET approved=true'),/permission denied/i);
  await assert.rejects(mediaCanceller.query('UPDATE '+guardSchema+'.anchor SET approved=true'),/permission denied/i);
  await assert.rejects(guardReader.query('UPDATE '+mediaSchema+'.asset SET approved=true'),/permission denied/i);

  const readMedia=async(id,_signal)=>{
    if(delayRead)started.resolve();
    try{
      const result=await mediaReader.query(
        'SELECT id,key,sha256_hex,content_type,bytes,approved,generation,'+
        (delayRead?'pg_sleep(5) AS delay':'NULL::text AS delay')+
        ' FROM '+mediaSchema+'.asset WHERE id=$1 AND approved=true',[id]);
      const row=result.rows[0];
      return row?{id:row.id,key:row.key,sha256Hex:row.sha256_hex,
        contentType:row.content_type,bytes:row.bytes,rightsApproved:row.approved,
        generation:row.generation}:null;
    }catch(e){if(delayRead)sqlCancelCode=e.code;throw e}
  };
  const readGuardian=async(id)=>{
    guardReads++;
    const result=await guardReader.query('SELECT approved,generation FROM '+
      guardSchema+'.anchor WHERE id=$1',[id]);
    return result.rows[0]??null;
  };
  const bucket={async get(key){
    readBucketCount++;
    if(key!==staged.key)return null;
    return {size:bytes.length,body:new Response(bytes).body,
      customMetadata:{sha256:sha},httpMetadata:{contentType:'image/png'}};
  }};
  server=http.createServer(async(req,res)=>{
    const ctrl=new AbortController();
    res.once('close',()=>{
      if(!res.writableFinished){
        abortCount++;ctrl.abort('actual_node_tcp_disconnect');
        if(delayRead){
          void mediaCanceller.query('SELECT pg_cancel_backend($1) AS cancelled',[targetPid])
           .then(q=>{cancelAck=q.rows[0]?.cancelled===true;cancelDone.resolve()})
           .catch(e=>{cancelError=String(e);cancelDone.resolve()});
        }
        closed.resolve();
      }
    });
    try{
      const response=await handleCmsMedia(
        new Request('http://127.0.0.1:'+port+req.url,{method:req.method}),{
          findApprovedAsset:createGuardianApprovalLookup({readMedia,readGuardian}),
          bucket,abortSignal:ctrl.signal
        });
      handlerStatus=response.status;
      if(!res.destroyed){
        res.writeHead(response.status,Object.fromEntries(response.headers.entries()));
        res.end(Buffer.from(await response.arrayBuffer()));
      }
    }catch{
      handlerStatus=503;
      if(!res.destroyed&&!res.headersSent){res.writeHead(503);res.end()}
    }finally{if(delayRead)handlerDone.resolve()}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');port=server.address().port;
  const url='http://127.0.0.1:'+port+'/v1/media/'+mediaId;
  const baseline=await fetch(url,{signal:AbortSignal.timeout(10000)});
  assert.equal(baseline.status,200);assert.deepEqual(Buffer.from(await baseline.arrayBuffer()),bytes);
  assert.equal(readBucketCount,1);assert.equal(guardReads,2);

  delayRead=true;
  const beforeBucket=readBucketCount,beforeGuardian=guardReads;
  client=http.get({hostname:'127.0.0.1',port,path:'/v1/media/'+mediaId},resp=>{
    resp.on('data',x=>{clientBytes+=x.byteLength});resp.resume();
  });
  client.on('error',()=>{});
  await withLimit(started.promise,'SQL dispatch');
  let activity;
  for(let i=0;i<70;i++){
    activity=(await admin.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[targetPid])).rows[0];
    if(activity?.state==='active'&&activity.query.includes('pg_sleep(5)'))break;
    await sleep(20);
  }
  assert.equal(activity?.state,'active','actual PG16 query must be running');
  activeBeforeAbort=true;
  await assert.rejects(guardReader.query('SELECT pg_cancel_backend($1)',[targetPid]),
    /permission denied|must be a member|not allowed/i);
  forbiddenCrossRoleCancel=true;
  // Two authenticated PG16 backend sessions are owned by the SAME reader role.
  // A deliberately targeted cancellation must NOT cancel the sibling request.
  const siblingQuery=siblingReader.query('SELECT pg_sleep(1.6),73 AS marker');
  for(let i=0;i<70;i++){
    const current=(await admin.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',
      [siblingPid])).rows[0];
    if(current?.state==='active'&&current.query.includes('pg_sleep(1.6)'))break;
    await sleep(20);
  }
  client.destroy();
  await withLimit(closed.promise,'real HTTP socket close');
  await withLimit(cancelDone.promise,'same-role PG16 cancellation acknowledgement');
  assert.equal(cancelError,null);
  assert.equal(cancelAck,true,'same login role may cancel its own backend without broad role grant');
  await withLimit(handlerDone.promise,'original CMS handler terminated by SQLSTATE 57014');
  assert.equal(sqlCancelCode,'57014');
  assert.equal(handlerStatus,503);
  assert.equal(abortCount,1);
  assert.equal(clientBytes,0);
  assert.equal(readBucketCount,beforeBucket);
  assert.equal(guardReads,beforeGuardian);
  const postAbortGuardianReads=guardReads-beforeGuardian; // freeze BEFORE independent fresh request
  const sibling=await withLimit(siblingQuery,'sibling backend unaffected by targeted cancel');
  assert.equal(sibling.rows[0].marker,73);
  assert.equal((await mediaReader.query('SELECT 73 AS recovered')).rows[0].recovered,73);
  mediaSessionRecovered=true;

  // Guardian authority remains owned by a completely different role and the
  // explicit cancellation cannot mutate its durable generation/approval.
  await guardOwner.query('BEGIN');
  try{
    const changed=await guardOwner.query('UPDATE '+guardSchema+
      '.anchor SET approved=false,generation=2 WHERE id=$1 AND approved=true AND generation=1',[mediaId]);
    assert.equal(changed.rowCount,1);
    await guardOwner.query('COMMIT');
  }catch(e){await guardOwner.query('ROLLBACK').catch(()=>{});throw e}
  const anchor=(await guardReader.query('SELECT approved,generation FROM '+guardSchema+
    '.anchor WHERE id=$1',[mediaId])).rows[0];
  assert.deepEqual(anchor,{approved:false,generation:'2'});
  delayRead=false;
  const fresh=await fetch(url,{signal:AbortSignal.timeout(10000)});
  assert.equal(fresh.status,404);
  assert.equal((await fresh.arrayBuffer()).byteLength,0);
  assert.equal(fresh.headers.get('cache-control'),'no-store');

  console.log(JSON.stringify({
    suite:'TUR073_REAL_NODE_TCP_PG16_SAME_ROLE_BACKEND_OWNERSHIP_CANCEL',
    actualCmsHandler:true,realLocalNodeHttp:true,disposablePostgres16:true,
    independentNonSuperuserRoles:4,restrictedPasswordSessions:6,
    pgSignalBackendGrant:false,
    actualPgStatActivityActiveBeforeTcpDisconnect:activeBeforeAbort,
    physicalTcpAbort:true,targetedSameRolePgCancelBackendAck:cancelAck,
    cancelledSqlState:sqlCancelCode,unaffectedSiblingQueryMarker:sibling.rows[0].marker,
    cancelledPgClientSessionStillUsable:mediaSessionRecovered,
    unauthorizedGuardianCrossRoleCancelDenied:forbiddenCrossRoleCancel,
    mediaOwnerCannotMutateGuardian:true,guardianOwnerIndependentCommit:true,
    cmsResultOnAbortedRequest:503,abortedClientDeliveredBytes:clientBytes,
    postAbortR2ObjectReads:readBucketCount-beforeBucket,
    postAbortGuardianSqlReads:postAbortGuardianReads,
    freshHttpAfterRevocation:404,
    originalOutboxShaLeaseAndDlq:'INHERITED_CI',commitAckAmbiguity:'INHERITED_TUR030',
    tur072UncancelledPgSql:'INHERITED_NEGATIVE',
    realCloudflareWorkerNextPhysicalSignal:'NOT_PROVEN',
    sqlSessionPoolingAndBackendPidReuse:'NOT_PROVEN',
    finalCdnByteReceiverAck:'NOT_PROVEN',issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  if(client)client.destroy();
  if(server){server.closeAllConnections?.();await new Promise(r=>server.close(r))}
  for(const c of sessions)await c.end().catch(()=>{});
  if(connected){
    await admin.query('DROP SCHEMA IF EXISTS '+mediaSchema+' CASCADE').catch(()=>{});
    await admin.query('DROP SCHEMA IF EXISTS '+guardSchema+' CASCADE').catch(()=>{});
    for(const role of [...roles].reverse())await admin.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await admin.end().catch(()=>{});
 }
});
