import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

/**
 * TUR115: a real RST_STREAM for request A must not authorize a DIFFERENT
 * authenticated PostgreSQL login to cancel/terminate request B's recycled
 * pg.Pool backend. Real PG16 role boundary, not production request binding.
 * Only disposable local postgres:16; no pg_signal_backend grants.
 */
const url=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR115_DISPOSABLE_PG16!=='1'||
 !url||url.protocol!=='postgresql:'||
 !['127.0.0.1','localhost'].includes(url.hostname)||
 url.port!=='5432'||url.pathname!=='/topwhiz_test'||
 decodeURIComponent(url.username)!=='topwhiz_test'||url.search||url.hash)
 throw Error('TUR115: explicit disposable localhost PostgreSQL16 opt-in required');

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timed=(promise,ms)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('TUR115: timed out')),ms);
 Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)});
});
const config=(user,password)=>({host:'127.0.0.1',port:5432,database:'topwhiz_test',user,password});

async function activeSql(admin,pid){
 for(let i=0;i<120;i++){
  const row=(await admin.query('SELECT state, query, backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(row?.state==='active'&&row.query.includes('pg_sleep(2.5)'))return row;
  await wait(20);
 }
 throw Error('TUR115: physical request B SQL did not become active');
}

async function physicalScenario(admin,media,guardian){
 const pool=new pg.Pool({...media,max:1,idleTimeoutMillis:30000});
 const guard=new pg.Client(guardian);
 const server=http2.createServer();
 let aPid,aStart,lease,closeResolve,closeReject,readyResolve,readyReject;
 const closeDone=new Promise((resolve,reject)=>{closeResolve=resolve;closeReject=reject});
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
 const denied=[];
 server.on('stream',(stream,headers)=>{
  if(headers[':path']==='/a'){
   stream.once('close',()=>{
    (async()=>{
     assert.equal(lease?.request,'B','A closed after B checkout');
     for(const [label,sql,args] of [
      ['cancel','SELECT pg_cancel_backend($1)',[aPid]],
      ['terminate','SELECT pg_terminate_backend($1)',[aPid]],
      ['set-role','SET ROLE "'+media.user+'"',[]]
     ]){
      try{await guard.query(sql,args);denied.push({label,sqlstate:'UNEXPECTED_ALLOW'})}
      catch(e){denied.push({label,sqlstate:e.code})}
     }
     closeResolve();
    })().catch(closeReject);
   });
   (async()=>{
    const c=await pool.connect();
    try{
     aPid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
     aStart=(await admin.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[aPid])).rows[0].backend_start;
    }finally{c.release()}
    stream.respond({':status':200});stream.write('HEAD');readyResolve();
   })().catch(readyReject);
  }else if(headers[':path']==='/b'){
   (async()=>{
    const c=await pool.connect();
    let status=200,body='115';
    try{
     const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
     lease={request:'B',pid};
     try{body=String((await c.query('SELECT pg_sleep(2.5), 115 AS marker')).rows[0].marker)}
     catch(e){status=503;body=String(e.code||'unknown')}
    }finally{lease=null;c.release()}
    if(!stream.destroyed){stream.respond({':status':status});stream.end(body)}
   })().catch(e=>{if(!stream.destroyed){stream.respond({':status':500});stream.end(String(e.code||e.message))}});
  }else{stream.respond({':status':404});stream.end()}
 });
 let session;
 try{
  await guard.connect();
  const who=(await guard.query('SELECT session_user AS s, current_user AS c')).rows[0];
  assert.equal(who.s,guardian.user);assert.equal(who.c,guardian.user);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  session=http2.connect('http://127.0.0.1:'+server.address().port);
  session.on('error',()=>{});
  const reqA=session.request({':path':'/a'});
  reqA.on('error',()=>{});reqA.on('data',()=>{});
  const responseA=once(reqA,'response');reqA.end();
  await timed(ready,5000);await timed(responseA,5000);
  const reqB=session.request({':path':'/b'});
  const bResult=new Promise((resolve,reject)=>{
   let status=null,body='';
   reqB.on('response',h=>{status=h[':status']});
   reqB.on('data',chunk=>{body+=chunk.toString()});
   reqB.on('end',()=>resolve({status,body}));reqB.on('error',reject);
  });
  reqB.end();
  const running=await activeSql(admin,aPid);
  assert.equal(new Date(running.backend_start).getTime(),new Date(aStart).getTime());
  assert.equal(lease?.pid,aPid,'same physical PG16 backend reused by B');
  reqA.close(http2.constants.NGHTTP2_CANCEL);
  await timed(closeDone,5000);
  assert.deepEqual(denied,[
   {label:'cancel',sqlstate:'42501'},
   {label:'terminate',sqlstate:'42501'},
   {label:'set-role',sqlstate:'42501'}
  ],'independent login has no cancel, terminate or role impersonation rights');
  assert.deepEqual(await timed(bResult,8000),{status:200,body:'115'});
  assert.equal(pool.totalCount,1);
  return {physicalHttp2Rst:true,realPg16PoolMax1:true,samePidAndBackendStart:true,
   independentLogin:true,denied,requestB:'COMPLETED',
   productionRequestSignal:'NOT_PROVEN',remoteR2CdnLastByte:'NOT_PROVEN'};
 }finally{
  session?.destroy();
  await new Promise(resolve=>server.close(resolve));
  await guard.end().catch(()=>{});await pool.end().catch(()=>{});
 }
}

test('TUR115 independent PG16 LOGIN denies stale HTTP2 A cancel/terminate/SET ROLE of B',{timeout:90000},async()=>{
 const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 const tag=randomBytes(5).toString('hex');
 const mediaUser='tur115_media_'+tag,guardUser='tur115_guard_'+tag;
 const mediaPass=randomBytes(16).toString('hex'),guardPass=randomBytes(16).toString('hex');
 let createdMedia=false,createdGuard=false;
 try{
  await admin.connect();
  const version=Number((await admin.query("SELECT current_setting('server_version_num') AS v")).rows[0].v);
  assert.ok(version>=160000&&version<170000,'disposable PostgreSQL16 required');
  await admin.query('CREATE ROLE "'+mediaUser+'" LOGIN PASSWORD \''+mediaPass+'\' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION');
  createdMedia=true;
  await admin.query('CREATE ROLE "'+guardUser+'" LOGIN PASSWORD \''+guardPass+'\' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION');
  createdGuard=true;
  for(const role of [mediaUser,guardUser]){
   const r=(await admin.query("SELECT rolcanlogin,rolsuper,rolcreaterole,pg_has_role(oid,(SELECT oid FROM pg_roles WHERE rolname='pg_signal_backend'),'member') AS signal_member FROM pg_roles WHERE rolname=$1",[role])).rows[0];
   assert.equal(r.rolcanlogin,true);assert.equal(r.rolsuper,false);
   assert.equal(r.rolcreaterole,false);assert.equal(r.signal_member,false);
  }
  const result=await physicalScenario(admin,config(mediaUser,mediaPass),config(guardUser,guardPass));
  console.log(JSON.stringify({suite:'TUR115_REAL_HTTP2_INDEPENDENT_PG16_IAM_NEGATIVE',
   postgresMajor:16,result,issue22:'OPEN',release:'NO_GO',
   tur018FictionalBytes:99276,tur019CrossIsolate:'PRESERVED_INHERITED',
   originalOutboxSha:'INHERITED_UNCHANGED',operatorIAM:'NOT_PROVEN'}));
 }finally{
  if(createdGuard)await admin.query('DROP ROLE IF EXISTS "'+guardUser+'"').catch(()=>{});
  if(createdMedia)await admin.query('DROP ROLE IF EXISTS "'+mediaUser+'"').catch(()=>{});
  await admin.end().catch(()=>{});
 }
});
