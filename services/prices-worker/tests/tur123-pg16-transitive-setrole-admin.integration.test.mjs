import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

/**
 * TUR123: real PG16, independent rights-admin login and TRANSITIVE SET ROLE.
 *
 * broker --SET TRUE--> relay --SET TRUE--> executor
 *   executor has ONLY the test-only SECURITY DEFINER function EXECUTE.
 *   It has no victim membership, and broker has no direct EXECUTE grant.
 *
 * Independently logged-in role administrator commits and rolls back
 * membership revocation; already-connected broker authorization is checked.
 * The old speculative test-only cancel function is NEVER production IAM.
 */
const uri=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR123_DISPOSABLE_PG16!=='1'||
 !uri||uri.protocol!=='postgresql:'||
 !['localhost','127.0.0.1'].includes(uri.hostname)||
 uri.port!=='5432'||uri.pathname!=='/topwhiz_test'||
 decodeURIComponent(uri.username)!=='topwhiz_test'||uri.search||uri.hash)
 throw Error('TUR123 requires explicit disposable localhost PostgreSQL16');

const suffix=randomBytes(5).toString('hex');
const roles=['victim','definer','executor','relay','broker',
  'rights_admin','spectator','guardian_owner','guardian_reader']
 .map(x=>'tw123_'+x+'_'+suffix);
const pw=roles.map(()=>randomBytes(20).toString('hex'));
const schema='tw123_gate_'+suffix,guard='tw123_guard_'+suffix;
const fn=schema+'.cancel_foreign(integer)';
const call='SELECT '+schema+'.cancel_foreign($1) AS cancelled';
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function awaitActive(root,pid,fragment){
 for(let i=0;i<160;i++){
  const row=(await root.query(
   'SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(row?.state==='active'&&row.query.includes(fragment))return;
  await delay(25);
 }
 throw Error('Physical PG16 query not active: '+fragment);
}
async function ongoing(client,root,pid,marker,seconds){
 const completion=client.query(
  'SELECT pg_sleep('+seconds+'),'+marker+' AS marker'
 ).then(x=>({marker:x.rows[0].marker}),error=>({error}));
 await awaitActive(root,pid,'pg_sleep('+seconds+')');
 return {completion}; // Avoid async Promise-adoption and false 57014 claims.
}
async function denied(p,code='42501'){
 await assert.rejects(p,e=>e?.code===code);
}
async function edge(root,member,target){
 return (await root.query(
  'SELECT pg_has_role($1,$2,$3) AS inherited,'+
  'pg_has_role($1,$2,$4) AS settable',
  [member,target,'USAGE','SET'])).rows[0];
}

test('real PG16 transitive SET ROLE grants a broker indirect SECDEF cancellation; independent rights-admin rollback vs COMMIT',{timeout:140000},async()=>{
 const root=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 let rootReady=false,pool;
 const sessions=[];
 try{
  await root.connect();rootReady=true;
  const n=Number((await root.query(
   "SELECT current_setting('server_version_num') AS n")).rows[0].n);
  assert.ok(n>=160000&&n<170000,'actual PostgreSQL16 required');
  for(let i=0;i<roles.length;i++){
   const login=[0,4,5,6,7,8].includes(i)?'LOGIN':'NOLOGIN';
   await root.query('CREATE ROLE '+roles[i]+' '+login+
    ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'+
    (login==='LOGIN'?" PASSWORD '"+pw[i]+"'":''));
  }
  // Separate NOLOGIN definer inherits only victim SQL role.
  await root.query('GRANT '+roles[0]+' TO '+roles[1]+
   ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  await root.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+roles[1]);
  await root.query('REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC');
  // Important: EXECUTOR itself needs schema USAGE after SET ROLE;
  // otherwise a schema-name check masks the actual function ACL result.
  await root.query('GRANT USAGE ON SCHEMA '+schema+' TO '+
   [roles[2],roles[4],roles[5],roles[6]].join(','));
  await root.query('CREATE FUNCTION '+schema+
   '.cancel_foreign(in_pid integer) RETURNS boolean LANGUAGE plpgsql '+
   'SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $func$ '+
   'BEGIN RETURN pg_catalog.pg_cancel_backend(in_pid); END; $func$');
  await root.query('ALTER FUNCTION '+fn+' OWNER TO '+roles[1]);
  await root.query('REVOKE ALL ON FUNCTION '+fn+' FROM PUBLIC');
  await root.query('GRANT EXECUTE ON FUNCTION '+fn+' TO '+roles[2]);
  assert.equal((await root.query('SELECT has_function_privilege($1,$2,$3) yes',
    [roles[4],fn,'EXECUTE'])).rows[0].yes,false);
  assert.equal((await root.query('SELECT has_function_privilege($1,$2,$3) yes',
    [roles[2],fn,'EXECUTE'])).rows[0].yes,true);
  const initial=(await root.query(
   'SELECT oid::text AS oid,proowner::regrole::text AS owner,prosecdef FROM pg_proc '+
   'WHERE oid=$1::regprocedure',[fn])).rows[0];
  assert.equal(initial.owner,roles[1]);assert.equal(initial.prosecdef,true);

  // Transitive SET path but neither edge permits privilege INHERIT.
  await root.query('GRANT '+roles[2]+' TO '+roles[3]+
   ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');
  // Independent rights-admin will grant/revoke broker->relay link;
  // it does not receive function EXECUTE, victim role, or superuser.
  await root.query('GRANT '+roles[3]+' TO '+roles[5]+
   ' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');
  await root.query('GRANT '+roles[2]+' TO '+roles[6]+
   ' WITH ADMIN FALSE, INHERIT FALSE, SET FALSE');

  await root.query('CREATE SCHEMA '+guard+' AUTHORIZATION '+roles[7]);
  await root.query('CREATE TABLE '+guard+
   '.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await root.query('ALTER TABLE '+guard+'.anchor OWNER TO '+roles[7]);
  await root.query('REVOKE ALL ON SCHEMA '+guard+' FROM PUBLIC');
  await root.query('REVOKE ALL ON '+guard+'.anchor FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+guard+' TO '+roles[8]);
  await root.query('GRANT SELECT ON '+guard+'.anchor TO '+roles[8]);
  await root.query("INSERT INTO "+guard+".anchor VALUES('fictional',true,1)");

  const loginUrl=i=>{const u=new URL(process.env.TEST_DATABASE_URL);
    u.username=roles[i];u.password=pw[i];return u.href};
  async function login(i){
   const c=new pg.Client({connectionString:loginUrl(i)});
   await c.connect();sessions.push(c);
   const row=(await c.query(
    "SELECT session_user,rolsuper,rolcreaterole,"+
    "pg_has_role(session_user,'pg_signal_backend','member') broad "+
    "FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.equal(row.session_user,roles[i]);
   assert.equal(row.rolsuper,false);assert.equal(row.rolcreaterole,false);
   assert.equal(row.broad,false);
   return c;
  }
  const broker=await login(4),rightsAdmin=await login(5),
   spectator=await login(6),guardianOwner=await login(7),
   reader=await login(8);
  await denied(spectator.query('REVOKE '+roles[3]+' FROM '+roles[4]),'42501');
  await rightsAdmin.query('GRANT '+roles[3]+' TO '+roles[4]+
   ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');
  const transitive=await edge(root,roles[4],roles[2]);
  assert.deepEqual(transitive,{inherited:false,settable:true},
   'two SET TRUE links authorize SET ROLE executor transitively');
  assert.deepEqual(await edge(root,roles[6],roles[2]),
   {inherited:false,settable:false});
  const grant=(await root.query(
   'SELECT grantor::regrole::text AS grantor,admin_option,inherit_option,set_option '+
   'FROM pg_auth_members WHERE roleid=$1::regrole AND member=$2::regrole',
   [roles[3],roles[4]])).rows[0];
  assert.equal(grant.grantor,roles[5],
   'broker membership must be granted by separately authenticated rights_admin');
  assert.equal(grant.admin_option,false);
  assert.equal(grant.inherit_option,false);
  assert.equal(grant.set_option,true);

  pool=new pg.Pool({connectionString:loginUrl(0),max:1,idleTimeoutMillis:30000});
  const A=await pool.connect();let pid,start;
  try{
   pid=(await A.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   start=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',
    [pid])).rows[0].backend_start;
   assert.equal((await A.query('SELECT 123 AS marker')).rows[0].marker,123);
  }finally{A.release()}
  const B=await pool.connect();
  try{
   const pidB=(await B.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const startB=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',
    [pidB])).rows[0].backend_start;
   assert.equal(pidB,pid);assert.equal(pool.totalCount,1);
   assert.equal(new Date(start).getTime(),new Date(startB).getTime());
   assert.notDeepEqual(
    {pid,start:new Date(start).toISOString(),epoch:1,request:'A'},
    {pid,start:new Date(startB).toISOString(),epoch:2,request:'B'});

   await denied(broker.query('SELECT pg_cancel_backend($1)',[pid]));
   await denied(rightsAdmin.query('SELECT pg_cancel_backend($1)',[pid]));
   await denied(spectator.query(call,[pid]));
   await denied(broker.query(call,[pid]));
   await denied(rightsAdmin.query(call,[pid]));
   await denied(spectator.query('SET ROLE '+roles[2]));

   // Broker's current role has neither inherited EXECUTE nor victim IAM.
   // Transitive SET ROLE succeeds through broker -> relay -> executor.
   await broker.query('SET ROLE '+roles[2]);
   try{
    const identity=(await broker.query(
     'SELECT session_user AS session,current_user AS effective')).rows[0];
    assert.equal(identity.session,roles[4]);assert.equal(identity.effective,roles[2]);
    await denied(broker.query('SELECT pg_cancel_backend($1)',[pid]));
    const running=(await ongoing(B,root,pid,1231,6)).completion;
    assert.equal((await broker.query(call,[pid])).rows[0].cancelled,true);
    assert.equal((await running).error?.code,'57014');
   }finally{await broker.query('RESET ROLE')}
   await denied(broker.query(call,[pid]));

   // Independent admin's rolled-back REVOKE must NOT cut authority.
   await rightsAdmin.query('BEGIN');
   try{
    await rightsAdmin.query('REVOKE '+roles[3]+' FROM '+roles[4]);
    await rightsAdmin.query('ROLLBACK');
   }catch(e){await rightsAdmin.query('ROLLBACK').catch(()=>{});throw e}
   assert.deepEqual(await edge(root,roles[4],roles[2]),
    {inherited:false,settable:true},
    'ROLLBACK must preserve the grant and transitive SET path');
   await broker.query('SET ROLE '+roles[2]);
   try{
    const again=(await ongoing(B,root,pid,1232,6)).completion;
    assert.equal((await broker.query(call,[pid])).rows[0].cancelled,true);
    assert.equal((await again).error?.code,'57014');
   }finally{await broker.query('RESET ROLE')}

   // Independent role admin's committed REVOKE removes access for an
   // already logged-in broker. No superuser rights are needed to revoke
   // the edge it previously granted using ADMIN option.
   await rightsAdmin.query('BEGIN');
   try{
    await rightsAdmin.query('REVOKE '+roles[3]+' FROM '+roles[4]);
    await rightsAdmin.query('COMMIT');
   }catch(e){await rightsAdmin.query('ROLLBACK').catch(()=>{});throw e}
   assert.deepEqual(await edge(root,roles[4],roles[2]),
    {inherited:false,settable:false});
   await denied(broker.query('SET ROLE '+roles[2]));
   await denied(broker.query(call,[pid]));
   const safe=(await ongoing(B,root,pid,1233,1.2)).completion;
   await denied(broker.query('SET ROLE '+roles[2]));
   assert.deepEqual(await safe,{marker:1233});
  }finally{B.release()}

  await denied(spectator.query('UPDATE '+guard+
   ".anchor SET approved=true WHERE id='fictional'"));
  await guardianOwner.query('BEGIN');
  try{
   const result=await guardianOwner.query(
    'UPDATE '+guard+".anchor SET approved=false,generation=2 "+
    "WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(result.rowCount,1);await guardianOwner.query('COMMIT');
  }catch(e){await guardianOwner.query('ROLLBACK').catch(()=>{});throw e}
  const anchor=(await reader.query('SELECT approved,generation FROM '+guard+
   ".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(anchor,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR123_REAL_PG16_TRANSITIVE_SET_ROLE_INDEPENDENT_ADMIN_ROLLBACK_COMMIT',
   pgMajor:16,independentLoginRoles:6,noLoginDefinerRelayExecutor:true,
   physicalPgPoolMax1:true,samePidAndBackendStartAtoB:true,
   noBrokerDirectCancel42501:true,noBrokerInheritedFunctionExec42501:true,
   transitiveSetPathBrokerRelayExecutor:true,
   twoEdgesSetTrueButInheritFalse:true,
   independentAdminGrantorAttested:true,
   spectatorSetRoleDenied42501:true,
   brokerSetRoleExecutorSessionUserUnchanged:true,
   brokerSetRoleDirectCancelDenied42501:true,
   brokerFunctionCancelForeignB57014:true,
   adminRollbackRetainsTransitiveSetAccess:true,
   rollbackThenBrokerCancelForeignB57014:true,
   adminCommittedRevokeRemovesTransitiveSet:true,
   existingBrokerSetRoleAfterCommitDenied42501:true,
   BFinishedAfterRevokeMarker:1233,
   guardianOwnerCommitGeneration:'2',
   serviceSuperuserGranted:false,globalPgSignalBackendGranted:false,
   actualLostCommitAck:'NOT_TESTED',
   productionRequestScopedIam:'NOT_IMPLEMENTED',
   physicalNextWorkerRequestSignal:'NOT_PROVEN',
   osPidRecycling:'NOT_TESTED',cdnReceiverAckLastByte:'NOT_PROVEN',
   issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  if(pool)await pool.end().catch(()=>{});
  for(const c of sessions)await c.end().catch(()=>{});
  if(rootReady){
   await root.query('DROP OWNED BY '+roles.join(',')+' CASCADE').catch(()=>{});
   await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   await root.query('DROP SCHEMA IF EXISTS '+guard+' CASCADE').catch(()=>{});
   for(const role of [...roles].reverse())
    await root.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await root.end().catch(()=>{});
 }
});