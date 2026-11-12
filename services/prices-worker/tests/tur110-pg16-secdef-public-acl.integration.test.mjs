import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

/**
 * TUR110: actual, ephemeral PostgreSQL16 negative demonstration.
 * Default PUBLIC EXECUTE on a SECURITY DEFINER cancel function allows a
 * separate untrusted LOGIN to cancel another request before REVOKE.
 * A single CREATE+REVOKE transaction closes the PUBLIC publication window.
 * Even then, an explicitly granted broker remains too powerful to bind SQL
 * cancellation to the actual request: hard release NO-GO.
 */
const url=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR110_DISPOSABLE_PG16!=='1'||
 !url||url.protocol!=='postgresql:'||
 !['localhost','127.0.0.1'].includes(url.hostname)||
 (url.port&&url.port!=='5432')||url.pathname!=='/topwhiz_test'||
 decodeURIComponent(url.username)!=='topwhiz_test'||url.search||url.hash)
 throw Error('TUR110 requires explicitly opted-in isolated localhost PG16');
const suffix=randomBytes(5).toString('hex');
const names=['victim','definer','outsider','broker','guardian_reader','guardian_owner']
 .map(x=>'tw110_'+x+'_'+suffix);
const pw=names.map(()=>randomBytes(20).toString('hex'));
const gate='tw110_gate_'+suffix,guard='tw110_guard_'+suffix;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitActive(root,pid,fragment){
 for(let i=0;i<130;i++){
  const row=(await root.query(
   'SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(row?.state==='active'&&row.query.includes(fragment))return;
  await delay(25);
 }
 throw Error('actual PG16 query did not become active: '+fragment);
}
async function startSql(client,root,pid,marker,seconds){
 // Return a non-thenable wrapper: do not await completion before cancellation.
 const completion=client.query('SELECT pg_sleep('+seconds+'),'+marker+' AS marker').then(
  x=>({marker:x.rows[0].marker}),error=>({error}));
 await waitActive(root,pid,'pg_sleep('+seconds+')');
 return {completion};
}
async function expectSqlState(p,expected){
 await assert.rejects(p,error=>error?.code===expected);
}
function makeCancelSql(name){
 return 'CREATE FUNCTION '+gate+'.'+name+
  '(in_pid integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER '+
  'SET search_path = pg_catalog, pg_temp AS $body$ '+
  'BEGIN RETURN pg_catalog.pg_cancel_backend(in_pid); END; $body$';
}
test('real PG16: default PUBLIC SECURITY DEFINER EXECUTE window vs transactional REVOKE and trusted caller gap',{timeout:120000},async()=>{
 const root=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 let rootOpen=false,pool;
 const sessions=[];
 try{
  await root.connect();rootOpen=true;
  const major=Number((await root.query(
   "SELECT current_setting('server_version_num') v")).rows[0].v);
  assert.ok(major>=160000&&major<170000,'actual PostgreSQL16 server required');
  for(let i=0;i<names.length;i++){
   const login=i===1?'NOLOGIN':'LOGIN';
   await root.query('CREATE ROLE '+names[i]+' '+login+
    ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'+
    (login==='LOGIN'?" PASSWORD '"+pw[i]+"'":''));
  }
  await root.query('GRANT '+names[0]+' TO '+names[1]+
   ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  const r=(await root.query('SELECT pg_has_role($1,$2,$3) inherited',
   [names[1],names[0],'USAGE'])).rows[0].inherited;
  assert.equal(r,true,'definer only inherits victim SQL cancel privilege');
  await root.query('CREATE SCHEMA '+gate+' AUTHORIZATION '+names[1]);
  await root.query('REVOKE ALL ON SCHEMA '+gate+' FROM PUBLIC');
  // Deliberately allow outsiders to resolve schema names, so that only
  // PUBLIC EXECUTE on an unguarded definer function is the test variable.
  await root.query('GRANT USAGE ON SCHEMA '+gate+' TO '+names[2]+','+names[3]);
  await root.query('CREATE SCHEMA '+guard+' AUTHORIZATION '+names[5]);
  await root.query('CREATE TABLE '+guard+
   '.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await root.query('ALTER TABLE '+guard+'.anchor OWNER TO '+names[5]);
  await root.query('REVOKE ALL ON SCHEMA '+guard+' FROM PUBLIC');
  await root.query('REVOKE ALL ON '+guard+'.anchor FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+guard+' TO '+names[4]);
  await root.query('GRANT SELECT ON '+guard+'.anchor TO '+names[4]);
  await root.query("INSERT INTO "+guard+".anchor VALUES('fictional',true,1)");
  function urlFor(i){
   const u=new URL(process.env.TEST_DATABASE_URL);
   u.username=names[i];u.password=pw[i];return u.href;
  }
  pool=new pg.Pool({connectionString:urlFor(0),max:1,idleTimeoutMillis:30000});
  async function login(i){
   const c=new pg.Client({connectionString:urlFor(i)});
   await c.connect();sessions.push(c);
   const info=(await c.query("SELECT session_user,rolsuper,rolcreaterole,"+
    "pg_has_role(session_user,'pg_signal_backend','member') signal FROM pg_roles "+
    "WHERE rolname=session_user")).rows[0];
   assert.equal(info.session_user,names[i]);
   assert.equal(info.rolsuper,false);assert.equal(info.rolcreaterole,false);
   assert.equal(info.signal,false);
   return c;
  }
  const outsider=await login(2),broker=await login(3),
   guardReader=await login(4),guardOwner=await login(5);
  const A=await pool.connect();
  let pid,backendStart;
  try{
   pid=(await A.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   backendStart=(await root.query(
    'SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].backend_start;
   assert.equal((await A.query('SELECT 110 AS marker')).rows[0].marker,110);
  }finally{A.release()}
  const B=await pool.connect();
  try{
   const bPid=(await B.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const bStart=(await root.query(
    'SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[bPid])).rows[0].backend_start;
   assert.equal(bPid,pid);assert.equal(pool.totalCount,1);
   assert.equal(new Date(bStart).getTime(),new Date(backendStart).getTime());
   const ticketA={pid,start:new Date(backendStart).toISOString(),request:'A',epoch:1};
   const ticketB={pid,start:new Date(bStart).toISOString(),request:'B',epoch:2};
   assert.notDeepEqual(ticketA,ticketB,'application ticket protects only code that checks it');
   await expectSqlState(outsider.query('SELECT pg_cancel_backend($1)',[pid]),'42501');
   await expectSqlState(broker.query('SELECT pg_cancel_backend($1)',[pid]),'42501');

   // Phase 1: function CREATE committed before function REVOKE, so all SQL
   // roles implicitly acquire EXECUTE via PUBLIC despite no direct grant.
   const leaky=gate+'.leaky_cancel(integer)';
   const callLeaky='SELECT '+gate+'.leaky_cancel($1) cancelled';
   await root.query(makeCancelSql('leaky_cancel'));
   await root.query('ALTER FUNCTION '+leaky+' OWNER TO '+names[1]);
   const before=(await root.query(
    'SELECT has_function_privilege($1,$2,$3) allowed',
    [names[2],leaky,'EXECUTE'])).rows[0].allowed;
   assert.equal(before,true,'PostgreSQL default new-function PUBLIC EXECUTE');
   const profile=(await root.query(
    'SELECT prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure',
    [leaky])).rows[0];
   assert.equal(profile.prosecdef,true);
   assert.ok(profile.proconfig.some(s=>s==='search_path=pg_catalog, pg_temp'));
   const task1=(await startSql(B,root,pid,1101,6)).completion;
   const leaked=(await outsider.query(callLeaky,[pid])).rows[0].cancelled;
   assert.equal(leaked,true,'outsider exploits initial PUBLIC EXECUTE release window');
   assert.equal((await task1).error?.code,'57014');
   assert.equal((await B.query('SELECT 110 AS recovered')).rows[0].recovered,110);
   await root.query('REVOKE ALL ON FUNCTION '+leaky+' FROM PUBLIC');
   assert.equal((await root.query(
    'SELECT has_function_privilege($1,$2,$3) allowed',
    [names[2],leaky,'EXECUTE'])).rows[0].allowed,false);
   await expectSqlState(outsider.query(callLeaky,[pid]),'42501');
   await expectSqlState(broker.query(callLeaky,[pid]),'42501');

   // Phase 2: CREATE and REVOKE before a single COMMIT. A different
   // authenticated connection cannot observe the function pre-COMMIT;
   // after COMMIT it sees function but cannot execute it.
   const atomic=gate+'.atomic_cancel(integer)';
   const callAtomic='SELECT '+gate+'.atomic_cancel($1) cancelled';
   await root.query('BEGIN');
   try{
    await root.query(makeCancelSql('atomic_cancel'));
    await root.query('ALTER FUNCTION '+atomic+' OWNER TO '+names[1]);
    await root.query('REVOKE ALL ON FUNCTION '+atomic+' FROM PUBLIC');
    await root.query('GRANT EXECUTE ON FUNCTION '+atomic+' TO '+names[3]);
    await assert.rejects(outsider.query(callAtomic,[pid]),
      e=>e?.code==='42883'||e?.code==='42501',
      'uncommitted ACL creation must remain invisible or fail closed');
    await root.query('COMMIT');
   }catch(error){await root.query('ROLLBACK').catch(()=>{});throw error}
   assert.equal((await root.query(
    'SELECT has_function_privilege($1,$2,$3) allowed',
    [names[2],atomic,'EXECUTE'])).rows[0].allowed,false);
   assert.equal((await root.query(
    'SELECT has_function_privilege($1,$2,$3) allowed',
    [names[3],atomic,'EXECUTE'])).rows[0].allowed,true);
   await expectSqlState(outsider.query(callAtomic,[pid]),'42501');
   await expectSqlState(guardReader.query(callAtomic,[pid]),'42501');

   // Transactional ACL closure is not request-bound authorization.
   // The broker has a legitimate SQL EXECUTE grant, but no grant proving
   // it owns B's request and can still cancel the live B SQL.
   const task2=(await startSql(B,root,pid,1102,6)).completion;
   const crossRequest=(await broker.query(callAtomic,[pid])).rows[0].cancelled;
   assert.equal(crossRequest,true,'EXPLICIT broker grant is still not per-request IAM');
   assert.equal((await task2).error?.code,'57014');
   await root.query('REVOKE EXECUTE ON FUNCTION '+atomic+' FROM '+names[3]);
   await expectSqlState(broker.query(callAtomic,[pid]),'42501');
   const safe=(await startSql(B,root,pid,1103,1.2)).completion;
   await expectSqlState(broker.query(callAtomic,[pid]),'42501');
   assert.deepEqual(await safe,{marker:1103});
  }finally{B.release()}
  await expectSqlState(outsider.query(
   'UPDATE '+guard+".anchor SET approved=true WHERE id='fictional'"),'42501');
  await guardOwner.query('BEGIN');
  try{
   const changed=await guardOwner.query('UPDATE '+guard+
    ".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(changed.rowCount,1);await guardOwner.query('COMMIT');
  }catch(error){await guardOwner.query('ROLLBACK').catch(()=>{});throw error}
  const anchor=(await guardReader.query(
   'SELECT approved,generation FROM '+guard+".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(anchor,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR110_REAL_PG16_SECDEF_CREATE_REVOKE_PUBLIC_EXECUTE_WINDOW',
   postgresMajor:16,physicalPgPoolMax1:true,sameBackendPidAndStartAcrossCheckout:true,
   defaultNewFunctionPublicExecAllowed:true,outsiderDirectPgCancelDenied42501:true,
   outsiderLeakyPublicExecuteCancelledB57014:true,postPublicRevokeDenied42501:true,
   atomicCreateRevokeUncommittedInvisible:true,atomicPostCommitPublicExecuteDenied42501:true,
   explicitBrokerGrantStillCancelledOtherRequest57014:true,
   brokerExecuteRevokeRestored42501:true,subsequentBQueryCompletedMarker:1103,
   definerNoLogin:true,restrictedLogins:5,noBroadPgSignalBackend:true,
   guardianOwnerCommitGeneration:'2',
   productionRequestBoundIAM:'NOT_IMPLEMENTED',physicalOsPidRecycling:'NOT_TESTED',
   nextWorkerdPhysicalRequestSignal:'NOT_PROVEN',cdnReceiverLastByte:'NOT_PROVEN',
   issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  if(pool)await pool.end().catch(()=>{});
  for(const c of sessions)await c.end().catch(()=>{});
  if(rootOpen){
   await root.query('DROP SCHEMA IF EXISTS '+gate+' CASCADE').catch(()=>{});
   await root.query('DROP SCHEMA IF EXISTS '+guard+' CASCADE').catch(()=>{});
   for(const name of [...names].reverse())await root.query('DROP ROLE IF EXISTS '+name).catch(()=>{});
  }
  await root.end().catch(()=>{});
 }
});