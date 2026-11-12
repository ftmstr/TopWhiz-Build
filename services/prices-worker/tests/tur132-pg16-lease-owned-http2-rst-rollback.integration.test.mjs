import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// TUR132: localhost disposable PostgreSQL16 + physical HTTP2 RST.
// This test-owned narrow SECURITY DEFINER helper is NOT production IAM.
// Inherited TUR131 separately reruns physical lost COMMIT-ACK reconciliation.
const raw=process.env.TEST_DATABASE_URL||'';
const url=(()=>{try{return new URL(raw)}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR132_DISPOSABLE_PG16!=='1'||
 !url||url.protocol!=='postgresql:'||!['127.0.0.1','localhost'].includes(url.hostname)||
 url.port!=='5432'||url.pathname!=='/topwhiz_test'||
 decodeURIComponent(url.username)!=='topwhiz_test'||url.search||url.hash)
 throw Error('TUR132 disposable localhost PG16 opt-in required');

const tag=randomBytes(5).toString('hex');
const roles=Object.fromEntries(['broker','executor','owner','rights','a','b'].map(k=>[k,'tw132_'+k+'_'+tag]));
const pass=Object.fromEntries(['broker','rights','a','b'].map(k=>[k,randomBytes(18).toString('hex')]));
const schema='tw132_acl_'+tag,receipts=schema+'.synthetic_receipts',leases=schema+'.lease';
const fn=schema+'.guarded_cancel(integer,timestamptz,text,text,integer)';
const call='SELECT '+schema+'.guarded_cancel($1,$2,$3,$4,$5) AS ok';
const nonceA=randomBytes(18).toString('hex'),nonceB=randomBytes(18).toString('hex'),nonceC=randomBytes(18).toString('hex');
const login=k=>{const u=new URL(raw);u.username=roles[k];u.password=pass[k];return u.href};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});promise.catch(()=>{});return {promise,resolve,reject}}
const denied=(p,c)=>assert.rejects(p,e=>e?.code===c);
const within=(p,ms,n)=>new Promise((r,j)=>{
 const t=setTimeout(()=>j(Error('TUR132 timeout '+n)),ms);
 Promise.resolve(p).then(x=>{clearTimeout(t);r(x)},e=>{clearTimeout(t);j(e)});
});
async function start(root,pid){
 const row=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
 assert.ok(row);return new Date(row.backend_start).getTime();
}
async function active(root,pid,fragment){
 for(let n=0;n<180;n++){
  const row=(await root.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(row?.state==='active'&&row.query.includes(fragment))return;
  await sleep(20);
 }
 throw Error('PG16 SQL inactive '+fragment);
}

test('ACKed aborted COMMIT ROLLBACK tag vs lost wire ACK and HTTP2 stale-tenant cancellation lease', {timeout:120000},async()=>{
 const root=new pg.Client({connectionString:raw});
 let connected=false,pool,server,h2;
 const sessions=[],closedA=deferred(),bReady=deferred();
 let aPid,aStart,bPid,bStart,actualRst,ackCommand;
 try{
  await root.connect();connected=true;
  const v=Number((await root.query("SELECT current_setting('server_version_num') AS v")).rows[0].v);
  assert.ok(v>=160000&&v<170000);
  for(const k of Object.keys(roles))
   await root.query('CREATE ROLE '+roles[k]+
    (pass[k]?" LOGIN PASSWORD '"+pass[k]+"'":' NOLOGIN')+
    ' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION');
  // Only the disposable NOLOGIN function owner is a member of broker.
  // Neither guardian nor rights-admin receives pg_signal_backend.
  await root.query('GRANT '+roles.broker+' TO '+roles.owner+
    ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  await root.query('GRANT '+roles.executor+' TO '+roles.rights+
    ' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');
  await root.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+roles.owner);
  await root.query('REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC');
  await root.query('CREATE TABLE '+receipts+' (id integer PRIMARY KEY,note text NOT NULL)');
  await root.query('ALTER TABLE '+receipts+' OWNER TO '+roles.owner);
  await root.query('REVOKE ALL ON TABLE '+receipts+' FROM PUBLIC');
  await root.query('CREATE TABLE '+leases+
    ' (slot integer PRIMARY KEY,pid integer NOT NULL,started timestamptz NOT NULL,'+
    ' tenant text NOT NULL,actor text NOT NULL,nonce text NOT NULL,epoch integer NOT NULL)');
  await root.query('ALTER TABLE '+leases+' OWNER TO '+roles.owner);
  await root.query('REVOKE ALL ON TABLE '+leases+' FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+schema+' TO '+
    [roles.executor,roles.rights,roles.a,roles.b].join(','));
  await root.query('GRANT INSERT ON '+receipts+' TO '+roles.executor);
  await root.query('GRANT SELECT,INSERT,UPDATE ON '+leases+' TO '+roles.rights);
  await root.query('CREATE FUNCTION '+fn+
    " RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$"+
    ' BEGIN IF NOT EXISTS (SELECT 1 FROM '+leases+
    ' WHERE slot=1 AND pid=$1 AND started=$2 AND tenant=$3'+
    ' AND actor=session_user AND nonce=$4 AND epoch=$5) THEN'+
    ' RETURN false; END IF; RETURN pg_catalog.pg_cancel_backend($1); END; $f$');
  await root.query('ALTER FUNCTION '+fn+' OWNER TO '+roles.owner);
  await root.query('REVOKE ALL ON FUNCTION '+fn+' FROM PUBLIC');
  await root.query('GRANT EXECUTE ON FUNCTION '+fn+' TO '+roles.a+','+roles.b);
  async function connect(k){
   const c=new pg.Client({connectionString:login(k)});await c.connect();sessions.push(c);
   const check=(await c.query(
     "SELECT rolsuper,rolcreaterole,pg_has_role(session_user,'pg_signal_backend','member') AS broad FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.deepEqual(check,{rolsuper:false,rolcreaterole:false,broad:false});
   return c;
  }
  const rights=await connect('rights'),ga=await connect('a'),gb=await connect('b');
  await rights.query('GRANT '+roles.executor+' TO '+roles.broker+
    ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');
  pool=new pg.Pool({connectionString:login('broker'),max:1,idleTimeoutMillis:30000});
  server=http2.createServer();
  server.on('stream',(stream,h)=>{
   if(h[':path']==='/a'){
    stream.once('close',()=>{
     (async()=>{
      actualRst=stream.rstCode;
      assert.equal(actualRst,http2.constants.NGHTTP2_CANCEL);
      await bReady.promise;
      // A's old lease and forged B token both denied by DB-checked actor.
      assert.equal((await ga.query(call,[aPid,new Date(aStart),'tenant-A',nonceA,1])).rows[0].ok,false);
      assert.equal((await ga.query(call,[aPid,new Date(aStart),'tenant-B',nonceB,2])).rows[0].ok,false);
      await denied(ga.query('SELECT pg_cancel_backend($1)',[bPid]),'42501');
      await denied(gb.query('SELECT pg_cancel_backend($1)',[bPid]),'42501');
      closedA.resolve();
     })().catch(closedA.reject);
    });
    stream.respond({':status':200,'cache-control':'no-store'});stream.write('HEAD');
   }else if(h[':path']==='/b'){
    (async()=>{
     const B=await pool.connect();
     try{
      bPid=(await B.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      bStart=await start(root,bPid);
      await rights.query('UPDATE '+leases+
       ' SET pid=$1,started=$2,tenant=$3,actor=$4,nonce=$5,epoch=2 WHERE slot=1',
       [bPid,new Date(bStart),'tenant-B',roles.b,nonceB]);
      bReady.resolve();
      const m=(await B.query('SELECT pg_sleep(3.0),132 AS marker')).rows[0].marker;
      stream.respond({':status':200});stream.end(String(m));
     }catch(e){bReady.reject(e);if(!stream.destroyed){stream.respond({':status':503});stream.end(e.code||e.message)}}
     finally{B.release()}
    })().catch(bReady.reject);
   }else{stream.respond({':status':404});stream.end()}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  h2=http2.connect('http://127.0.0.1:'+server.address().port);h2.on('error',()=>{});
  const reqA=h2.request({':path':'/a'});reqA.on('error',()=>{});reqA.on('data',()=>{});
  const headersA=deferred();reqA.on('response',headersA.resolve);reqA.end();
  await within(headersA.promise,6000,'A HTTP2 headers');

  const A=await pool.connect();let tx=false;
  try{
   aPid=(await A.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   aStart=await start(root,aPid);
   await rights.query('INSERT INTO '+leases+
     ' (slot,pid,started,tenant,actor,nonce,epoch) VALUES (1,$1,$2,$3,$4,$5,1)',
     [aPid,new Date(aStart),'tenant-A',roles.a,nonceA]);
   await A.query('BEGIN');tx=true;
   await A.query('SET LOCAL ROLE '+roles.executor);
   await A.query("INSERT INTO "+receipts+" VALUES (132,'abort-this')");
   await rights.query('BEGIN');
   try{
    await rights.query('REVOKE '+roles.executor+' FROM '+roles.broker);
    await rights.query('COMMIT');
   }catch(e){await rights.query('ROLLBACK').catch(()=>{});throw e}
   assert.equal((await root.query('SELECT pg_has_role($1,$2,$3) AS ok',
    [roles.broker,roles.executor,'SET'])).rows[0].ok,false);
   await denied(A.query("INSERT INTO "+receipts+" VALUES (132,'duplicate')"),'23505');
   await denied(A.query('SELECT 1'),'25P02');
   const ack=await A.query('COMMIT');tx=false;ackCommand=ack.command;
   assert.equal(ackCommand,'ROLLBACK');
   assert.equal((await A.query('SELECT current_user AS u')).rows[0].u,roles.broker);
   await denied(A.query('SET ROLE '+roles.executor),'42501');
  }finally{if(tx)await A.query('ROLLBACK').catch(()=>{});A.release()}
  assert.equal((await root.query('SELECT count(*)::integer AS n FROM '+receipts)).rows[0].n,0);

  const reqB=h2.request({':path':'/b'});reqB.on('error',()=>{});
  let bStatus,bBody='';
  const bResponse=new Promise((resolve,reject)=>{
   reqB.on('response',h=>{bStatus=h[':status']});
   reqB.on('data',c=>{bBody+=c.toString()});
   reqB.on('end',()=>resolve({status:bStatus,body:bBody}));
   reqB.on('error',reject);
  });reqB.end();
  await within(bReady.promise,6000,'B lease acquired');
  assert.equal(bPid,aPid);
  assert.equal(bStart,aStart);
  await within(active(root,bPid,'pg_sleep(3.0)'),6000,'B SQL active');
  reqA.close(http2.constants.NGHTTP2_CANCEL);
  await within(closedA.promise,7000,'late A RST guard');
  assert.deepEqual(await within(bResponse,7000,'B response'),{status:200,body:'132'});

  const C=await pool.connect();
  try{
   assert.equal((await C.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,aPid);
   await rights.query('UPDATE '+leases+
     ' SET tenant=$1,actor=$2,nonce=$3,epoch=3 WHERE slot=1',
     ['tenant-B',roles.b,nonceC]);
   const promise=C.query('SELECT pg_sleep(4.0),1323 AS marker').then(
     r=>({result:r.rows[0]}),e=>({code:e.code}));
   await within(active(root,aPid,'pg_sleep(4.0)'),7000,'C SQL active');
   assert.equal((await gb.query(call,[aPid,new Date(aStart),'tenant-B',nonceB,2])).rows[0].ok,false);
   assert.equal((await gb.query(call,[aPid,new Date(aStart),'tenant-B',nonceC,3])).rows[0].ok,true);
   assert.deepEqual(await within(promise,7000,'C cancellation'),{code:'57014'});
   assert.equal((await C.query('SELECT current_user AS u')).rows[0].u,roles.broker);
  }finally{C.release()}
  console.log(JSON.stringify({
   suite:'TUR132_REAL_PG16_LEASE_HTTP2_RST_ROLLBACK_TAG',
   postgresMajor:16,independentRestrictedRightsAdminRevokeCommit:true,
   abortedSQLStates:['23505','25P02'],resolvedCommitQueryTag:ackCommand,
   abortedDurableRows:0,physicalHttp2Rst:'NGHTTP2_CANCEL',
   samePidBackendStartAtoBtoC:true,epochs:[1,2,3],
   tenantAStaleAndForgedBDenied:true,guardianDirectCancel:'42501',
   validNewCLeaseCancelsSql:'57014',requestB:'COMPLETED',
   inheritedTUR131WireAckLoss:'RUN_SEPARATELY_IN_WORKFLOW',
   testOnlyDefiner:true,globalPgSignalBackendGranted:false,
   productionRequestSignalBridge:'NOT_IMPLEMENTED',
   liveCDNLastByte:'NOT_PROVEN',issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  h2?.destroy();
  if(server?.listening)await new Promise(r=>server.close(r));
  if(pool)await pool.end().catch(()=>{});
  for(const c of sessions)await c.end().catch(()=>{});
  if(connected){
   await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   await root.query('DROP OWNED BY '+Object.values(roles).join(',')+' CASCADE').catch(()=>{});
   for(const k of ['a','b','rights','executor','owner','broker'])
    await root.query('DROP ROLE IF EXISTS '+roles[k]).catch(()=>{});
  }
  await root.end().catch(()=>{});
 }
});
