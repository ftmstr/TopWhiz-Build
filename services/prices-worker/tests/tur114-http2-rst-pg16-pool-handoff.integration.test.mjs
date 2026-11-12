import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import {once} from 'node:events';
import pg from 'pg';

/**
 * TUR114: a physical HTTP/2 RST_STREAM on request A is not a trustworthy
 * cancellation authority for SQL request B after pg.Pool(max=1) handoff.
 * The deliberately unsafe cancellation uses a SAME-LOGIN test admin and
 * MUST NEVER be copied into production. Guarded case only models a lease
 * comparison; independent IAM and actual Next/workerd Request.signal
 * integration remain unimplemented release blockers.
 */
const db=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR114_DISPOSABLE_PG16!=='1'||
 !db||db.protocol!=='postgresql:'||
 !['127.0.0.1','localhost'].includes(db.hostname)||
 (db.port&&db.port!=='5432')||db.pathname!=='/topwhiz_test'||
 decodeURIComponent(db.username)!=='topwhiz_test'||db.search||db.hash)
 throw Error('TUR114: disposable localhost PostgreSQL16 explicit opt-in required');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function active(root,pid){
 for(let i=0;i<100;i++){
  const row=(await root.query('SELECT state,query,backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(row?.state==='active'&&row.query.includes('pg_sleep(2)'))return row;
  await wait(25);
 }
 throw Error('TUR114: B SQL never became physically active');
}
async function withTimeout(p,ms){
 return Promise.race([p,wait(ms).then(()=>{throw Error('TUR114: HTTP2 event timed out')})]);
}
async function scenario(root,unsafe){
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,idleTimeoutMillis:30000});
 const server=http2.createServer();
 let aPid=null,aStart=null,activeLease=null,cancelResult=null;
 let readyResolve,readyReject,closeResolve,closeReject;
 const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j});
 const closeDone=new Promise((r,j)=>{closeResolve=r;closeReject=j});
 server.on('stream',(stream,headers)=>{
  if(headers[':path']==='/a'){
   stream.once('close',()=>{
    (async()=>{
     if(unsafe || (activeLease?.request==='A'&&activeLease.pid===aPid)){
      const row=await root.query('SELECT pg_cancel_backend($1) AS cancelled',[aPid]);
      cancelResult=row.rows[0].cancelled;
     }else cancelResult=false;
     closeResolve();
    })().catch(closeReject);
   });
   (async()=>{
    const c=await pool.connect();
    try{
     const row=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0];
     aPid=row.pid;
     aStart=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[aPid])).rows[0].backend_start;
    }finally{c.release()}
    stream.respond({':status':200,'content-type':'text/plain'});
    stream.write('HEAD');
    readyResolve();
   })().catch(readyReject);
  }else if(headers[':path']==='/b'){
   (async()=>{
    const c=await pool.connect();
    let status=200,body='114';
    try{
     const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
     activeLease={request:'B',pid,epoch:2};
     try{
      const row=await c.query('SELECT pg_sleep(2),114 AS marker');
      body=String(row.rows[0].marker);
     }catch(e){status=503;body=String(e.code||'unknown')}
    }finally{activeLease=null;c.release()}
    if(!stream.destroyed){
     stream.respond({':status':status,'content-type':'text/plain'});
     stream.end(body);
    }
   })().catch(e=>{if(!stream.destroyed){stream.respond({':status':500});stream.end(String(e.code||e.message))}});
  }else{stream.respond({':status':404});stream.end()}
 });
 let session;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  session=http2.connect('http://127.0.0.1:'+server.address().port);
  session.on('error',()=>{});
  const reqA=session.request({':path':'/a'});
  reqA.on('error',()=>{});reqA.on('data',()=>{});
  const responseA=once(reqA,'response');
  reqA.end();
  await withTimeout(ready,5000);
  await withTimeout(responseA,5000);
  const reqB=session.request({':path':'/b'});
  const bResult=new Promise((resolve,reject)=>{
   let status=null,body='';
   reqB.on('response',h=>{status=h[':status']});
   reqB.on('data',c=>{body+=c.toString()});
   reqB.on('end',()=>resolve({status,body}));
   reqB.on('error',reject);
  });
  reqB.end();
  const running=await active(root,aPid);
  assert.equal(new Date(running.backend_start).getTime(),new Date(aStart).getTime());
  assert.equal(activeLease?.request,'B');
  assert.equal(activeLease.pid,aPid,'same physical pg.Pool backend reused by B');
  reqA.close(http2.constants.NGHTTP2_CANCEL);
  await withTimeout(closeDone,5000);
  const result=await withTimeout(bResult,8000);
  if(unsafe){
   assert.equal(cancelResult,true,'stale A close callback cancels active B');
   assert.deepEqual(result,{status:503,body:'57014'});
  }else{
   assert.equal(cancelResult,false,'A close has no B request lease');
   assert.deepEqual(result,{status:200,body:'114'});
  }
  assert.equal(pool.totalCount,1);
  return {mode:unsafe?'unsafe':'lease-guarded',rstStream:'NGHTTP2_CANCEL',
   samePidAndBackendStart:true,staleACancelledB:unsafe,
   bSqlState:unsafe?'57014':'completed'};
 }finally{
  session?.destroy();
  await new Promise(r=>server.close(r));
  await pool.end();
 }
}

test('TUR114 real HTTP2 RST_STREAM stale callback crosses physical PG16 Pool request lease',{timeout:90000},async()=>{
 const root=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 try{
  await root.connect();
  const n=Number((await root.query("SELECT current_setting('server_version_num') AS v")).rows[0].v);
  assert.ok(n>=160000&&n<170000,'real disposable PostgreSQL16 required');
  const unsafe=await scenario(root,true);
  const guarded=await scenario(root,false);
  console.log(JSON.stringify({suite:'TUR114_REAL_HTTP2_RST_PG16_POOL_HANDOFF_NEGATIVE',
   postgresMajor:16,unsafe,guarded,physicalHttp2:true,realPgPoolMax1:true,
   sameLoginTestOnlyCancellation:true,independentOperatorIAM:'NOT_PROVEN',
   productionRequestSignal:'NOT_PROVEN',receiverLastByte:'NOT_PROVEN',
   originalOutboxSha:'INHERITED_UNCHANGED',issue22:'OPEN',release:'NO_GO'}));
 }finally{await root.end().catch(()=>{})}
});
