import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer, get as httpGet} from 'node:http';
import {once} from 'node:events';
import pg from 'pg';

/** Real disposable PG16 + actual node-postgres Pool(max=1) + local physical TCP.
 * Negative path: abandoned streaming HTTP request A has released its DB slot;
 * request B reuses the SAME PG backend; A's late socket close cancels B via
 * same-role pg_cancel_backend. Test-only lease gate prevents an app callback,
 * but cannot revoke direct same-role SQL cancellation privilege.
 */
let uri;
try { uri=new URL(process.env.TEST_DATABASE_URL || ''); } catch {}
if(process.env.CI!=='true'||process.env.TUR095_DISPOSABLE_PG16!=='1'||
   !uri||uri.protocol!=='postgresql:'||
   !['127.0.0.1','localhost'].includes(uri.hostname)||
   (uri.port&&uri.port!=='5432')||uri.pathname!=='/topwhiz_test'||
   decodeURIComponent(uri.username)!=='topwhiz_test'||uri.search||uri.hash)
  throw Error('TUR095 requires opt-in disposable localhost PostgreSQL16 only');
const suf=randomBytes(5).toString('hex');
const roles=['reader','media_owner','guardian_reader','guardian_owner'].map(x=>'tw095_'+x+'_'+suf);
const passwords=roles.map(()=>randomBytes(20).toString('hex'));
const g='tw095_guard_'+suf;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function bounded(p,label,ms=15000){let timer;try{
 return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timeout')),ms)})]);
}finally{clearTimeout(timer)}}
async function activeQuery(admin,pid,fragment){
 for(let n=0;n<150;n++){
  const s=(await admin.query('SELECT state, query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(s?.state==='active' && s.query.includes(fragment))return;
  await delay(20);
 }
 throw Error('expected active PG16 SQL '+fragment);
}
test('real HTTP socket close after pg.Pool checkout handoff cancels a different request; a lease-only app guard is bypassable',{timeout:120000},async()=>{
 const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 let adminConnected=false,server,pool;
 const sessions=[],aSockets=[],phases=[];
 try{
  await admin.connect();adminConnected=true;
  const version=Number((await admin.query("SELECT current_setting('server_version_num') n")).rows[0].n);
  assert.ok(version>=160000 && version<170000,'actual PG16 only');
  for(let n=0;n<roles.length;n++)
   await admin.query('CREATE ROLE '+roles[n]+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+passwords[n]+"'");
  await admin.query('CREATE SCHEMA '+g+' AUTHORIZATION '+roles[3]);
  await admin.query('CREATE TABLE '+g+'.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await admin.query('ALTER TABLE '+g+'.anchor OWNER TO '+roles[3]);
  await admin.query('REVOKE ALL ON SCHEMA '+g+' FROM PUBLIC');
  await admin.query('REVOKE ALL ON '+g+'.anchor FROM PUBLIC');
  await admin.query('GRANT USAGE ON SCHEMA '+g+' TO '+roles[2]);
  await admin.query('GRANT SELECT ON '+g+'.anchor TO '+roles[2]);
  await admin.query("INSERT INTO "+g+".anchor VALUES('fictional',true,1)");
  const urlFor=n=>{const u=new URL(process.env.TEST_DATABASE_URL);u.username=roles[n];u.password=passwords[n];return u.href};
  pool=new pg.Pool({connectionString:urlFor(0),max:1,min:0,idleTimeoutMillis:30000});
  async function login(n){
   const c=new pg.Client({connectionString:urlFor(n)});await c.connect();sessions.push(c);
   const v=(await c.query("SELECT session_user,rolsuper,rolcreaterole,pg_has_role(session_user,'pg_signal_backend','member') AS signal_member FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.equal(v.session_user,roles[n]);assert.equal(v.rolsuper,false);
   assert.equal(v.rolcreaterole,false);assert.equal(v.signal_member,false);
   return c;
  }
  const canceller=await login(0),sibling=await login(0),mediaOwner=await login(1),
   guardianReader=await login(2),guardianOwner=await login(3);
  const audit=(await pool.query("SELECT session_user,pg_has_role(session_user,'pg_signal_backend','member') signal_member")).rows[0];
  assert.equal(audit.session_user,roles[0]);assert.equal(audit.signal_member,false);
  let epoch=0,active=null,current=null;
  server=createServer(async (req,res)=>{
   const phase=current;
   if(!phase || (req.url!=='/a'&&req.url!=='/b')){res.writeHead(404);res.end();return;}
   res.setHeader('Cache-Control','no-store');
   if(req.url==='/a'){
    let c;try{
     c=await pool.connect();
     const pid=(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;
     const token={pid,epoch:++epoch,request:'A-'+phase.mode};
     phase.ticket=token;phase.aPid=pid;
     c.release();c=null;phase.aDbReleased.resolve();
     // Keep physical HTTP response open after SQL checkout was returned.
     res.writeHead(200,{'Content-Type':'text/plain'});res.write('A');
     res.once('close',()=>{
      if(res.writableFinished)return;
      phase.physicalClose=true;
      const now=active;
      if(phase.mode==='guarded' && (!now || now.pid!==token.pid ||
         now.epoch!==token.epoch || now.request!==token.request)){
       phase.appRejectedStale=true;phase.cancelSettled.resolve();return;
      }
      void canceller.query('SELECT pg_cancel_backend($1) cancelled',[token.pid])
        .then(result=>{phase.cancelAcknowledged=result.rows[0].cancelled===true;phase.cancelSettled.resolve()})
        .catch(error=>{phase.cancelError=String(error);phase.cancelSettled.resolve()});
     });
    }catch(error){if(c)c.release(true);phase.failure=String(error);if(!res.headersSent){res.writeHead(503);res.end()}}
    return;
   }
   let c;
   try{
    c=await pool.connect();
    const pid=(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    phase.bPid=pid;
    active={pid,epoch:++epoch,request:'B-'+phase.mode};
    phase.bAcquired.resolve();
    const out=await c.query('SELECT pg_sleep(3.5), 95 AS marker');
    phase.bMarker=out.rows[0].marker;
    res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');
   }catch(error){
    phase.bSqlstate=error.code ?? null;
    if(!res.headersSent){res.writeHead(503);res.end()}
   }finally{
    if(c)c.release();phase.bFinished.resolve();
    if(active?.request==='B-'+phase.mode)active=null;
   }
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port;
  async function scenario(mode){
   const phase={mode,aDbReleased:gate(),bAcquired:gate(),cancelSettled:gate(),bFinished:gate(),
    ticket:null,aPid:null,bPid:null,bMarker:null,bSqlstate:null,physicalClose:false,
    appRejectedStale:false,cancelAcknowledged:false,cancelError:null};
   phases.push(phase);current=phase;
   const firstByte=gate();
   const a=httpGet({hostname:'127.0.0.1',port,path:'/a'},resp=>{
    resp.once('data',()=>firstByte.resolve());
    resp.on('error',()=>{});resp.resume();
   });
   a.on('error',()=>{});aSockets.push(a);
   await bounded(firstByte.promise,'first A HTTP byte');
   await bounded(phase.aDbReleased.promise,'real A DB release');
   assert.equal(pool.totalCount,1);
   assert.equal(pool.idleCount,1,'actual Pool returned the original backend before B checkout');
   // Session reset must not be confused with a new SQL authentication boundary.
   await pool.query('DISCARD ALL');
   const bFetch=fetch('http://127.0.0.1:'+port+'/b',{signal:AbortSignal.timeout(13000)});
   await bounded(phase.bAcquired.promise,'B checkout');
   assert.equal(phase.aPid,phase.bPid,'same PG backend handed to a different HTTP request');
   assert.equal(pool.totalCount,1,'actual pg.Pool(max=1) in use');
   assert.notEqual(phase.ticket.epoch,active.epoch);
   await activeQuery(admin,phase.bPid,'pg_sleep(3.5)');
   if(mode==='unsafe'){
    await assert.rejects(mediaOwner.query('SELECT pg_cancel_backend($1)',[phase.bPid]),e=>e?.code==='42501');
    await assert.rejects(guardianReader.query('SELECT pg_cancel_backend($1)',[phase.bPid]),e=>e?.code==='42501');
    const siblingWork=sibling.query('SELECT pg_sleep(1.1),95 AS marker').then(
      rows=>({marker:rows.rows[0].marker}),error=>({error}));
    const siblingPid=(await admin.query("SELECT pid FROM pg_stat_activity WHERE usename=$1 AND query LIKE '%pg_sleep(1.1)%' AND state='active' ORDER BY pid DESC LIMIT 1",[roles[0]])).rows[0]?.pid;
    if(siblingPid)assert.notEqual(siblingPid,phase.bPid);
    a.destroy();
    await bounded(phase.cancelSettled.promise,'physical A close cancel');
    const response=await bounded(bFetch,'B cancelled response');
    const body=await response.arrayBuffer();
    await bounded(phase.bFinished.promise,'B SQL settled');
    assert.equal(response.status,503);assert.equal(body.byteLength,0);
    assert.equal(phase.bSqlstate,'57014');
    assert.equal(phase.cancelAcknowledged,true);
    const siblingResult=await siblingWork;
    assert.deepEqual(siblingResult,{marker:95});
   } else {
    a.destroy();
    await bounded(phase.cancelSettled.promise,'physical A close lease denial');
    const response=await bounded(bFetch,'B unaffected response');
    assert.equal(response.status,200);assert.equal(await response.text(),'OK');
    await bounded(phase.bFinished.promise,'B SQL completed');
    assert.equal(phase.bMarker,95);assert.equal(phase.bSqlstate,null);
    assert.equal(phase.appRejectedStale,true);
    assert.equal(phase.cancelAcknowledged,false);
   }
   assert.equal(phase.physicalClose,true,'real localhost TCP close required');
   assert.equal(phase.cancelError,null);
   assert.equal((await pool.query('SELECT 95 AS recovered')).rows[0].recovered,95);
   current=null;
   return phase;
  }
  const unsafe=await scenario('unsafe'),guarded=await scenario('guarded');
  await guardianOwner.query('BEGIN');
  try{
   const row=await guardianOwner.query('UPDATE '+g+".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(row.rowCount,1);await guardianOwner.query('COMMIT');
  }catch(error){await guardianOwner.query('ROLLBACK').catch(()=>{});throw error}
  const anchor=(await guardianReader.query('SELECT approved,generation FROM '+g+".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(anchor,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR095_ACTUAL_NODE_HTTP_DISCONNECT_PG_POOL_HANDOFF',
   realPgMajor:16,realNodeHttpSockets:true,actualPgPoolMax1:true,
   poolPidSameAcrossAandB:unsafe.aPid===unsafe.bPid&&guarded.aPid===guarded.bPid,
   physicalAHttpDisconnectAfterDbRelease:true,staleAAbortCancelledDifferentB:true,
   unsafeBSqlstate:unsafe.bSqlstate,unsafeBHttpStatus:503,
   guardedStaleAbortIgnored:true,guardedBHttpStatus:200,guardedBMarker:guarded.bMarker,
   directSameRoleSqlPrivilegeStillUnrestricted:true,
   restrictedRoles:4,restrictedConnections:6,globalPgSignalBackendGranted:false,
   crossRolePgCancelDenied:true,guardianOwnerGeneration:anchor.generation,
   osPidRecycling:'NOT_TESTED',productionPoolIAM:'NOT_ENFORCED',
   productionNextWorkerdRequestSignal:'NOT_PROVEN',
   remoteReceiverFinalByte:'NOT_PROVEN',issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  for(const req of aSockets)req.destroy();
  if(server){server.closeAllConnections?.();await new Promise(r=>server.close(r))}
  if(pool)await pool.end().catch(()=>{});
  for(const c of sessions)await c.end().catch(()=>{});
  if(adminConnected){
   await admin.query('DROP SCHEMA IF EXISTS '+g+' CASCADE').catch(()=>{});
   for(const role of [...roles].reverse())await admin.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await admin.end().catch(()=>{});
 }
});