import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

/**
 * TUR096 — real PG16: role-switching a pooled session does NOT create a fresh
 * authenticated request principal or scope pg_cancel_backend. Unlike TUR095's
 * HTTP socket race, this tests a second trust boundary: SET ROLE vs session_user.
 * Actual pg.Pool(max=1) enforces checkout exclusivity, but a second same-login
 * session can cancel B's SQL even after A's role context was reset and reused.
 * A different, non-member LOGIN is denied. No production authorization claim.
 */
const uri=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR096_DISPOSABLE_PG16!=='1'||
 !uri||uri.protocol!=='postgresql:'||
 !['localhost','127.0.0.1'].includes(uri.hostname)||
 (uri.port&&uri.port!=='5432')||uri.pathname!=='/topwhiz_test'||
 decodeURIComponent(uri.username)!=='topwhiz_test'||uri.search||uri.hash)
 throw Error('TUR096: explicit isolated disposable localhost PG16 required');

const suffix=randomBytes(5).toString('hex');
const names=['pool_login','stage_a','stage_b','isolated_login','guardian_reader','guardian_owner']
 .map(x=>'tw096_'+x+'_'+suffix);
const passwords=names.map(()=>randomBytes(20).toString('hex'));
const schema='tw096_guard_'+suffix;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function active(admin,pid,sql){
 for(let i=0;i<120;i++){
  const q=(await admin.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(q?.state==='active'&&q.query.includes(sql))return;
  await sleep(20);
 }
 throw Error('no active PG16 SQL '+sql);
}
function staleTicketDenied(ticket,now){
 return !now||ticket.pid!==now.pid||ticket.epoch!==now.epoch||
   ticket.request!==now.request||ticket.login!==now.login;
}
function bounded(p,label,ms=12000){let timer;return Promise.race([
 p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms)})
]).finally(()=>clearTimeout(timer))}

test('actual PG16 SET ROLE on a max=1 pool cannot isolate request cancellation across shared session_user, but truly separate LOGIN denies',{timeout:120000},async()=>{
 const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 let adminReady=false,pool;
 const clients=[];
 try {
  await admin.connect();adminReady=true;
  const major=Number((await admin.query("SELECT current_setting('server_version_num') v")).rows[0].v);
  assert.ok(major>=160000&&major<170000,'actual PG16 server required');
  for(let i=0;i<names.length;i++) {
   const login=(i===1||i===2)?'NOLOGIN':'LOGIN';
   await admin.query('CREATE ROLE '+names[i]+' '+login+
    ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'+
    (login==='LOGIN'?" PASSWORD '"+passwords[i]+"'":''));
  }
  await admin.query('GRANT '+names[1]+' TO '+names[0]);
  await admin.query('GRANT '+names[2]+' TO '+names[0]);
  await admin.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+names[5]);
  await admin.query('CREATE TABLE '+schema+'.anchor(id text PRIMARY KEY, approved boolean NOT NULL,generation bigint NOT NULL)');
  await admin.query('ALTER TABLE '+schema+'.anchor OWNER TO '+names[5]);
  await admin.query('REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC');
  await admin.query('REVOKE ALL ON '+schema+'.anchor FROM PUBLIC');
  await admin.query('GRANT USAGE ON SCHEMA '+schema+' TO '+names[4]);
  await admin.query('GRANT SELECT ON '+schema+'.anchor TO '+names[4]);
  await admin.query("INSERT INTO "+schema+".anchor VALUES('fictional',true,1)");
  const urlFor=i=>{const u=new URL(process.env.TEST_DATABASE_URL);u.username=names[i];u.password=passwords[i];return u.href};
  pool=new pg.Pool({connectionString:urlFor(0),max:1,idleTimeoutMillis:30000});
  async function login(i){
   const c=new pg.Client({connectionString:urlFor(i)});await c.connect();clients.push(c);
   const v=(await c.query("SELECT session_user,rolsuper,rolcreaterole,"+
      "pg_has_role(session_user,'pg_signal_backend','member') signal_member FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.equal(v.session_user,names[i]);assert.equal(v.rolsuper,false);
   assert.equal(v.rolcreaterole,false);assert.equal(v.signal_member,false);
   return c;
  }
  const sameLoginCanceller=await login(0),independent=await login(3),
    guardReader=await login(4),guardOwner=await login(5);
  assert.equal((await pool.query('SELECT session_user who')).rows[0].who,names[0]);
  // Checkout A is EXCLUSIVE: another checkout cannot acquire a second backend.
  const A=await pool.connect();
  let aHeld=true;
  try {
   await A.query('SET ROLE '+names[1]);
   const first=(await A.query('SELECT session_user login,current_user effective,pg_backend_pid() pid')).rows[0];
   assert.equal(first.login,names[0]);assert.equal(first.effective,names[1]);
   const old={pid:first.pid,login:first.login,request:'HTTP_A',epoch:1};
   let bReady=false;
   const pending=pool.connect().then(client=>{bReady=true;return client});
   await sleep(90);
   assert.equal(bReady,false,'max=1 pool physically keeps checkout B queued');
   assert.equal(pool.waitingCount,1);
   assert.equal(pool.totalCount,1);
   await A.query('RESET ROLE');
   await A.query('DISCARD ALL');
   A.release();aHeld=false;
   const B=await bounded(pending,'next PG pool checkout');
   try {
    assert.equal(bReady,true);
    await B.query('SET ROLE '+names[2]);
    const second=(await B.query('SELECT session_user login,current_user effective,pg_backend_pid() pid')).rows[0];
    assert.equal(second.login,names[0],'SET ROLE does not change session_user');
    assert.equal(second.effective,names[2],'effective role changes for request B');
    assert.equal(second.pid,first.pid,'physical PG backend survives pool checkout and role reset');
    const current={pid:second.pid,login:second.login,request:'HTTP_B',epoch:2};
    assert.equal(staleTicketDenied(old,current),true,'test-only lease rejects stale A');
    assert.equal(staleTicketDenied(current,current),false);
    // Live SQL belongs to B, but backend belongs to shared pool_login session_user.
    const bQuery=B.query('SELECT pg_sleep(4),96 AS marker').then(
      value=>({marker:value.rows[0].marker}),error=>({error}));
    await active(admin,second.pid,'pg_sleep(4)');
    await assert.rejects(independent.query('SELECT pg_cancel_backend($1)',[second.pid]),
      error=>error?.code==='42501','independent LOGIN cannot cancel shared pool_login backend');
    await assert.rejects(guardReader.query('SELECT pg_cancel_backend($1)',[second.pid]),
      error=>error?.code==='42501','guardian cannot cancel media SQL');
    const direct=await sameLoginCanceller.query('SELECT pg_cancel_backend($1) cancelled',[old.pid]);
    assert.equal(direct.rows[0].cancelled,true,'same session_user can cancel B ignoring SET ROLE and app ticket');
    const b=await bounded(bQuery,'request B cancellation');
    assert.equal(b.error?.code,'57014');
    assert.equal((await B.query('SELECT current_user effective,96 recovered')).rows[0].recovered,96);
    await B.query('RESET ROLE');
   } finally {
    B.release();
   }
  } finally {if(aHeld)A.release()}
  // Control: an actually isolated authenticated LOGIN has an independent PID
  // and cannot be cancelled by the shared pool role (no reciprocal membership).
  const independentPid=(await independent.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const isoWork=independent.query('SELECT pg_sleep(1.3),97 AS marker').then(
   row=>({marker:row.rows[0].marker}),error=>({error}));
  await active(admin,independentPid,'pg_sleep(1.3)');
  await assert.rejects(sameLoginCanceller.query('SELECT pg_cancel_backend($1)',[independentPid]),
    error=>error?.code==='42501','pool login must not cancel independent login backend');
  const isolatedResult=await bounded(isoWork,'isolated SQL completion');
  assert.deepEqual(isolatedResult,{marker:97});
  // Distinct guardian table-owner still controls independent revocation epoch.
  await assert.rejects(sameLoginCanceller.query('UPDATE '+schema+".anchor SET approved=true WHERE id='fictional'"),
    error=>error?.code==='42501');
  await guardOwner.query('BEGIN');
  try{
   const changed=await guardOwner.query('UPDATE '+schema+
    ".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(changed.rowCount,1);await guardOwner.query('COMMIT');
  }catch(error){await guardOwner.query('ROLLBACK').catch(()=>{});throw error}
  const anchor=(await guardReader.query('SELECT approved,generation FROM '+schema+
   ".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(anchor,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR096_REAL_PG16_SET_ROLE_LOGIN_IDENTITY_POOL_CANCEL_NEGATIVE',
   serverMajor:16,realNodePgPoolMaxOne:true,exclusiveCheckoutQueueObserved:true,
   samePhysicalPidAfterDiscardAll:true,sessionLoginStableAcrossSetRole:true,
   differentCurrentUserPerRequest:true,applicationOldEpochRejected:true,
   directSharedLoginBypassedEpoch:true,requestBCancelSqlstate:'57014',
   independentLoginCancellationDenied:true,independentSqlMarker:isolatedResult.marker,
   restrictedRoles:6,restrictedLogins:4,restrictedAuthenticatedSessions:5,
   pgSignalBackendGranted:false,guardianIndependentCommitGeneration:anchor.generation,
   osPidRecycling:'NOT_TESTED',productionExclusiveCancelAuthority:'NOT_IMPLEMENTED',
   physicalHttpDisconnect:'INHERITED_TUR095',
   realNextWorkerRequestSignal:'NOT_PROVEN',remoteCdnLastByte:'NOT_PROVEN',
   originalOutboxAndQueue:'INHERITED_CI',issue22:'OPEN',release:'NO_GO'
  }));
 } finally {
  if(pool)await pool.end().catch(()=>{});
  for(const c of clients)await c.end().catch(()=>{});
  if(adminReady){
   await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   for(const name of [...names].reverse())await admin.query('DROP ROLE IF EXISTS '+name).catch(()=>{});
  }
  await admin.end().catch(()=>{});
 }
});