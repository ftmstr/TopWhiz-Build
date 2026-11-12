import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

/**
 * TUR113: real disposable PostgreSQL16 ROLE-SPECIFIC FUNCTION DEFAULT ACL.
 * A global ALTER DEFAULT PRIVILEGES FOR ROLE creatorA safely removes PUBLIC
 * EXECUTE, but neither SET ROLE creatorB in the same admin SQL session nor
 * ALTER DEFAULT PRIVILEGES IN SCHEMA creatorB REVOKE can inherit/remove the
 * global built-in PUBLIC function EXECUTE. Only explicit role-B global default
 * privilege change or transactional function ACL revocation protects new
 * SECURITY DEFINER entrypoints; explicitly granted broker EXECUTE remains
 * non-request-scoped and can cancel a different request.
 */
const connection=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR113_DISPOSABLE_PG16!=='1'||
 !connection||connection.protocol!=='postgresql:'||
 !['127.0.0.1','localhost'].includes(connection.hostname)||
 (connection.port&&connection.port!=='5432')||
 connection.pathname!=='/topwhiz_test'||
 decodeURIComponent(connection.username)!=='topwhiz_test'||
 connection.search||connection.hash)
 throw Error('TUR113: explicitly opted-in disposable localhost PostgreSQL16 only');

const suffix=randomBytes(5).toString('hex');
const roles=['victim','creator_a','creator_b','outsider','broker','guardian_reader','guardian_owner']
 .map(x=>'tw113_'+x+'_'+suffix);
const passwords=roles.map(()=>randomBytes(20).toString('hex'));
const schema='tw113_gate_'+suffix,guardian='tw113_guard_'+suffix;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const functionName=(name)=>schema+'.'+name+'(integer)';
const functionCall=(name)=>'SELECT '+schema+'.'+name+'($1) AS cancelled';
const makeFunction=(name)=>
 'CREATE FUNCTION '+schema+'.'+name+'(in_pid integer) RETURNS boolean '+
 'LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp '+
 'AS $fn$ BEGIN RETURN pg_catalog.pg_cancel_backend(in_pid); END; $fn$';
async function running(root,pid,fragment){
 for(let i=0;i<160;i++){
  const v=(await root.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(v?.state==='active'&&v.query.includes(fragment))return;
  await wait(25);
 }
 throw Error('PG16 query did not become active for '+fragment);
}
async function startActive(client,root,pid,marker,secs){
 // Promise adoption would wait for query completion before cancellation.
 const promise=client.query('SELECT pg_sleep('+secs+'),'+marker+' AS marker')
  .then(row=>({marker:row.rows[0].marker}),error=>({error}));
 await running(root,pid,'pg_sleep('+secs+')');
 return {promise};
}
async function rejectCode(p,code){
 await assert.rejects(p,err=>err?.code===code);
}
async function permitted(root,who,name){
 return (await root.query('SELECT has_function_privilege($1,$2,$3) yes',
  [who,functionName(name),'EXECUTE'])).rows[0].yes;
}
async function creator(root,name,role,sessionLogin){
 const row=(await root.query(
  'SELECT p.prosecdef, p.proowner::regrole::text AS owner '+
  'FROM pg_proc AS p WHERE p.oid=$1::regprocedure',
  [functionName(name)])).rows[0];
 assert.equal(row.prosecdef,true);
 assert.equal(row.owner,role);
 return row;
}

test('real PG16 SET ROLE creator identity and schema-scoped default REVOKE cannot close PUBLIC SECDEF execute window',{timeout:120000},async()=>{
 const root=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 const sessions=[];let adminReady=false,pool;
 try{
  await root.connect();adminReady=true;
  const major=Number((await root.query("SELECT current_setting('server_version_num') v")).rows[0].v);
  assert.ok(major>=160000&&major<170000,'physical PostgreSQL16 required');
  for(let i=0;i<roles.length;i++){
   const login=i===1||i===2?'NOLOGIN':'LOGIN';
   await root.query('CREATE ROLE '+roles[i]+' '+login+
    ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'+
    (login==='LOGIN'?" PASSWORD '"+passwords[i]+"'":''));
  }
  for(const idx of [1,2])
   await root.query('GRANT '+roles[0]+' TO '+roles[idx]+
    ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  await root.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+roles[1]);
  await root.query('REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC');
  await root.query('GRANT CREATE ON SCHEMA '+schema+' TO '+roles[2]);
  await root.query('GRANT USAGE ON SCHEMA '+schema+' TO '+roles[3]+','+roles[4]);
  await root.query('CREATE SCHEMA '+guardian+' AUTHORIZATION '+roles[6]);
  await root.query('CREATE TABLE '+guardian+
    '.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await root.query('ALTER TABLE '+guardian+'.anchor OWNER TO '+roles[6]);
  await root.query('REVOKE ALL ON SCHEMA '+guardian+' FROM PUBLIC');
  await root.query('REVOKE ALL ON '+guardian+'.anchor FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+guardian+' TO '+roles[5]);
  await root.query('GRANT SELECT ON '+guardian+'.anchor TO '+roles[5]);
  await root.query("INSERT INTO "+guardian+".anchor VALUES('fictional',true,1)");

  const urlFor=i=>{const x=new URL(process.env.TEST_DATABASE_URL);
   x.username=roles[i];x.password=passwords[i];return x.href};
  pool=new pg.Pool({connectionString:urlFor(0),max:1,idleTimeoutMillis:30000});
  async function login(i){
   const c=new pg.Client({connectionString:urlFor(i)});
   await c.connect();sessions.push(c);
   const row=(await c.query("SELECT session_user,rolsuper,rolcreaterole,"+
    "pg_has_role(session_user,'pg_signal_backend','member') signal "+
    "FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.equal(row.session_user,roles[i]);assert.equal(row.rolsuper,false);
   assert.equal(row.rolcreaterole,false);assert.equal(row.signal,false);
   return c;
  }
  const outsider=await login(3),broker=await login(4),
   guardianReader=await login(5),guardianOwner=await login(6);

  // The schema-specific REVOKE cannot revoke the global built-in PUBLIC
  // function EXECUTE privilege. Global FOR ROLE creator_a change can.
  await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+roles[1]+
   ' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
  await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+roles[2]+
   ' IN SCHEMA '+schema+' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');

  const adminLogin=(await root.query('SELECT session_user AS login')).rows[0].login;
  await root.query('SET ROLE '+roles[1]);
  try{
   const identity=(await root.query('SELECT session_user AS login,current_user AS effective')).rows[0];
   assert.equal(identity.login,adminLogin);assert.equal(identity.effective,roles[1]);
   await root.query(makeFunction('a_global_locked'));
  }finally{await root.query('RESET ROLE')}
  await creator(root,'a_global_locked',roles[1]);
  assert.equal(await permitted(root,roles[3],'a_global_locked'),false);
  await rejectCode(outsider.query(functionCall('a_global_locked'),[1]),'42501');

  // Same authenticated SQL session, DIFFERENT effective creator.
  // No implicit transfer of creator A's globally scoped default ACL.
  await root.query('SET ROLE '+roles[2]);
  try{
   const identity=(await root.query('SELECT session_user AS login,current_user AS effective')).rows[0];
   assert.equal(identity.login,adminLogin);assert.equal(identity.effective,roles[2]);
   await root.query(makeFunction('b_schema_revoke_ineffective'));
  }finally{await root.query('RESET ROLE')}
  await creator(root,'b_schema_revoke_ineffective',roles[2]);
  assert.equal(await permitted(root,roles[3],'b_schema_revoke_ineffective'),true,
   'per-schema REVOKE must not undo built-in global PUBLIC EXECUTE');

  const A=await pool.connect();
  let pid,started;
  try{
   pid=(await A.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   started=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].backend_start;
   assert.equal((await A.query('SELECT 113 AS marker')).rows[0].marker,113);
  }finally{A.release()}
  const B=await pool.connect();
  try{
   const nowPid=(await B.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const nowStart=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[nowPid])).rows[0].backend_start;
   assert.equal(nowPid,pid);assert.equal(pool.totalCount,1);
   assert.equal(new Date(nowStart).getTime(),new Date(started).getTime());
   assert.notDeepEqual(
    {pid,backendStart:new Date(started).toISOString(),request:'A',epoch:1},
    {pid,backendStart:new Date(nowStart).toISOString(),request:'B',epoch:2});
   await rejectCode(outsider.query('SELECT pg_cancel_backend($1)',[pid]),'42501');
   await rejectCode(broker.query('SELECT pg_cancel_backend($1)',[pid]),'42501');
   const alive=(await startActive(B,root,pid,1131,6)).promise;
   const bypass=(await outsider.query(functionCall('b_schema_revoke_ineffective'),[pid])).rows[0].cancelled;
   assert.equal(bypass,true,'unprivileged outsider invokes newly-created SECDEF cancellation function');
   assert.equal((await alive).error?.code,'57014');
   assert.equal((await B.query('SELECT 113 AS recovered')).rows[0].recovered,113);

   // Global default privilege fix applies to FUTURE functions owned by B,
   // but does not retroactively fix old B function.
   await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+roles[2]+
    ' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
   assert.equal(await permitted(root,roles[3],'b_schema_revoke_ineffective'),true,
    'default-privilege change cannot retroactively revoke a published function');
   await root.query('SET ROLE '+roles[2]);
   try{await root.query(makeFunction('b_global_locked'))}
   finally{await root.query('RESET ROLE')}
   await creator(root,'b_global_locked',roles[2]);
   assert.equal(await permitted(root,roles[3],'b_global_locked'),false);
   await rejectCode(outsider.query(functionCall('b_global_locked'),[pid]),'42501');

   await root.query('REVOKE ALL ON FUNCTION '+functionName('b_schema_revoke_ineffective')+
    ' FROM PUBLIC');
   assert.equal(await permitted(root,roles[3],'b_schema_revoke_ineffective'),false);
   await rejectCode(outsider.query(functionCall('b_schema_revoke_ineffective'),[pid]),'42501');

   // Even explicit, limited EXECUTE is not an authenticated request grant.
   await root.query('GRANT EXECUTE ON FUNCTION '+functionName('b_global_locked')+
    ' TO '+roles[4]);
   const task=(await startActive(B,root,pid,1132,6)).promise;
   const crossRequest=(await broker.query(functionCall('b_global_locked'),[pid])).rows[0].cancelled;
   assert.equal(crossRequest,true,'function EXECUTE does not bind broker to request B');
   assert.equal((await task).error?.code,'57014');
   await root.query('REVOKE EXECUTE ON FUNCTION '+functionName('b_global_locked')+
    ' FROM '+roles[4]);
   await rejectCode(broker.query(functionCall('b_global_locked'),[pid]),'42501');
   const safe=(await startActive(B,root,pid,1133,1.2)).promise;
   await rejectCode(broker.query(functionCall('b_global_locked'),[pid]),'42501');
   assert.deepEqual(await safe,{marker:1133});
  }finally{B.release()}

  await rejectCode(outsider.query(
   'UPDATE '+guardian+".anchor SET approved=true WHERE id='fictional'"),'42501');
  await guardianOwner.query('BEGIN');
  try{
   const row=await guardianOwner.query('UPDATE '+guardian+
    ".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(row.rowCount,1);await guardianOwner.query('COMMIT');
  }catch(e){await guardianOwner.query('ROLLBACK').catch(()=>{});throw e}
  const marker=(await guardianReader.query(
   'SELECT approved,generation FROM '+guardian+".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(marker,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR113_REAL_PG16_ROLE_CREATOR_DEFAULT_FUNCTION_PUBLIC_ACL_NEGATIVE',
   postgresMajor:16,restrictedLogins:5,definerRolesNoLogin:true,
   identicalSessionUserCreatorSwitched:true,distinctEffectiveCreatorRoles:true,
   creatorAGlobalDefaultRevokeDeniedPublic42501:true,
   creatorBSchemaRevokeDidNotOverridePublic:true,
   creatorBLeakedPublicSecdefCancelledLiveB57014:true,
   creatorBGlobalDefaultChangeNotRetroactive:true,
   newCreatorBGlobalDefaultClosedPublic42501:true,
   oldFunctionExplicitRevokeClosedPublic42501:true,
   brokerExplicitExecuteStillCancelledForeignB57014:true,
   brokerExecuteRevokeRestored42501:true,
   sameActualPgPoolBackendPidAndStart:true,testOnlyRequestEpochChanged:true,
   finalBQueryMarker:1133,guardianOwnerGeneration:'2',
   pgSignalBackendGranted:false,serviceSuperuserGranted:false,
   realProductionOwnerIAM:'NOT_IMPLEMENTED',
   realRequestBoundCancelAuthority:'NOT_PROVEN',
   nextWorkerdPhysicalRequestSignal:'NOT_PROVEN',
   receiverCDNLastByte:'NOT_PROVEN',osPidRecycling:'NOT_TESTED',
   issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  await root.query('RESET ROLE').catch(()=>{});
  if(pool)await pool.end().catch(()=>{});
  for(const c of sessions)await c.end().catch(()=>{});
  if(adminReady){
   await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   await root.query('DROP SCHEMA IF EXISTS '+guardian+' CASCADE').catch(()=>{});
   for(const role of [...roles].reverse())
    await root.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await root.end().catch(()=>{});
 }
});