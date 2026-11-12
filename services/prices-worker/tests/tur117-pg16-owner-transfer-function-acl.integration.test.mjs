import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

/**
 * TUR117 — actual disposable PostgreSQL16 OWNER CHANGE escalation negative.
 *
 * SECURITY DEFINER canceller initially owned by a powerless NOLOGIN creator.
 * Its PUBLIC EXECUTE is removed via creator-specific global defaults, but an
 * explicit unrelated outsider EXECUTE is kept. An admin transfers the SAME
 * function (unchanged oid and outsider EXECUTE permission) to a separate NOLOGIN owner that inherits
 * victim-role cancellation rights. The existing outsider can now cancel B.
 * Revoking owner membership then caller EXECUTE independently cuts access.
 *
 * This function is intentionally unsafe for controlled TEST ONLY.
 * Nothing is deployed to production; no pg_signal_backend service membership.
 */
const u=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR117_DISPOSABLE_PG16!=='1'||
 !u||u.protocol!=='postgresql:'||
 !['localhost','127.0.0.1'].includes(u.hostname)||
 u.port!=='5432'||u.pathname!=='/topwhiz_test'||
 decodeURIComponent(u.username)!=='topwhiz_test'||u.search||u.hash)
 throw Error('TUR117 explicitly requires disposable localhost PostgreSQL16');

const seed=randomBytes(5).toString('hex');
const roles=['victim','old_creator','elevated_owner','outsider','broker','guardian_reader','guardian_owner']
  .map(n=>'tw117_'+n+'_'+seed);
const passwords=roles.map(()=>randomBytes(20).toString('hex'));
const schema='tw117_gate_'+seed,guard='tw117_guard_'+seed;
const fn=schema+'.cancel_victim(integer)';
const call='SELECT '+schema+'.cancel_victim($1) AS cancelled';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function active(root,pid,fragment){
 for(let i=0;i<150;i++){
  const s=(await root.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(s?.state==='active'&&s.query.includes(fragment))return;
  await sleep(25);
 }
 throw Error('PG16 victim query never entered active state: '+fragment);
}
async function startSql(client,root,pid,marker,secs){
 // Return an object to avoid async Promise adoption. The running SQL must
 // remain unresolved while another independently authenticated LOGIN acts.
 const pending=client.query('SELECT pg_sleep('+secs+'),'+marker+' AS marker')
  .then(x=>({marker:x.rows[0].marker}),error=>({error}));
 await active(root,pid,'pg_sleep('+secs+')');
 return {pending};
}
async function denied(promise,code='42501'){
 await assert.rejects(promise,e=>e?.code===code);
}
async function snapshot(root){
 return (await root.query(
  'SELECT oid::text AS oid, proowner::regrole::text AS owner, '+
  'proacl::text AS acl, prosecdef, proconfig '+
  'FROM pg_catalog.pg_proc WHERE oid=$1::regprocedure',[fn])).rows[0];
}
test('actual PG16 owner transfer changes SECURITY DEFINER cancellation authority with OID and outsider EXECUTE retained, grantor rewritten',{timeout:125000},async()=>{
 const root=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 const sessions=[];let rootOpen=false,pool;
 try{
  await root.connect();rootOpen=true;
  const version=Number((await root.query("SELECT current_setting('server_version_num') version")).rows[0].version);
  assert.ok(version>=160000&&version<170000,'real PostgreSQL16 required');
  for(let i=0;i<roles.length;i++){
   const login=(i===1||i===2)?'NOLOGIN':'LOGIN';
   await root.query('CREATE ROLE '+roles[i]+' '+login+
    ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'+
    (login==='LOGIN'?" PASSWORD '"+passwords[i]+"'":''));
  }
  // Only fixture-admin can transfer function ownership; service accounts
  // must not acquire owner, CREATEROLE, pg_signal_backend or superuser rights.
  await root.query('GRANT '+roles[0]+' TO '+roles[2]+
   ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  await root.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+roles[1]);
  await root.query('REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC');
  await root.query('GRANT USAGE, CREATE ON SCHEMA '+schema+' TO '+roles[2]);
  await root.query('GRANT USAGE ON SCHEMA '+schema+' TO '+roles[3]+','+roles[4]);
  await root.query('CREATE SCHEMA '+guard+' AUTHORIZATION '+roles[6]);
  await root.query('CREATE TABLE '+guard+
    '.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await root.query('ALTER TABLE '+guard+'.anchor OWNER TO '+roles[6]);
  await root.query('REVOKE ALL ON SCHEMA '+guard+' FROM PUBLIC');
  await root.query('REVOKE ALL ON '+guard+'.anchor FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+guard+' TO '+roles[5]);
  await root.query('GRANT SELECT ON '+guard+'.anchor TO '+roles[5]);
  await root.query("INSERT INTO "+guard+".anchor VALUES('fictional',true,1)");

  // Distinct global defaults for creator and elevated owner; owner transfer
  // must not recalculate the existing explicit outsider EXECUTE ACL.
  await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+roles[1]+
   ' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
  await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+roles[1]+
   ' GRANT EXECUTE ON FUNCTIONS TO '+roles[3]);
  await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+roles[2]+
   ' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
  const adminSession=(await root.query('SELECT session_user AS login')).rows[0].login;
  await root.query('SET ROLE '+roles[1]);
  try{
   const identity=(await root.query('SELECT session_user, current_user')).rows[0];
   assert.equal(identity.session_user,adminSession);
   assert.equal(identity.current_user,roles[1]);
   await root.query('CREATE FUNCTION '+schema+'.cancel_victim(in_pid integer) '+
    'RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER '+
    'SET search_path=pg_catalog,pg_temp AS $fn$ '+
    'BEGIN RETURN pg_catalog.pg_cancel_backend(in_pid); END; $fn$');
  }finally{await root.query('RESET ROLE')}
  const before=await snapshot(root);
  assert.equal(before.owner,roles[1]);
  assert.equal(before.prosecdef,true);
  assert.equal(before.proconfig?.some(x=>x.startsWith('search_path=')),true);
  assert.equal((await root.query('SELECT has_function_privilege($1,$2,$3) yes',
   [roles[3],fn,'EXECUTE'])).rows[0].yes,true);
  assert.equal((await root.query('SELECT has_function_privilege($1,$2,$3) yes',
   [roles[4],fn,'EXECUTE'])).rows[0].yes,false);

  const urlFor=i=>{const v=new URL(process.env.TEST_DATABASE_URL);
   v.username=roles[i];v.password=passwords[i];return v.href};
  pool=new pg.Pool({connectionString:urlFor(0),max:1,idleTimeoutMillis:30000});
  async function login(i){
   const c=new pg.Client({connectionString:urlFor(i)});
   await c.connect();sessions.push(c);
   const row=(await c.query("SELECT session_user,rolsuper,rolcreaterole,"+
    "pg_has_role(session_user,'pg_signal_backend','member') broad "+
    "FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.equal(row.session_user,roles[i]);assert.equal(row.rolsuper,false);
   assert.equal(row.rolcreaterole,false);assert.equal(row.broad,false);
   return c;
  }
  const outsider=await login(3),broker=await login(4),
   reader=await login(5),guardianOwner=await login(6);
  assert.equal((await root.query('SELECT rolcanlogin,rolsuper FROM pg_roles WHERE rolname=$1',
   [roles[2]])).rows[0].rolcanlogin,false);
  const A=await pool.connect();
  let pid,backendStart;
  try{
   pid=(await A.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   backendStart=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].backend_start;
   assert.equal((await A.query('SELECT 117 AS marker')).rows[0].marker,117);
  }finally{A.release()}
  const B=await pool.connect();
  try{
   assert.equal((await B.query('SELECT pg_backend_pid() pid')).rows[0].pid,pid);
   assert.equal(pool.totalCount,1);
   const newer=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].backend_start;
   assert.equal(new Date(backendStart).getTime(),new Date(newer).getTime());
   assert.notDeepEqual(
    {pid,start:new Date(backendStart).toISOString(),request:'A',epoch:1},
    {pid,start:new Date(newer).toISOString(),request:'B',epoch:2});
   await denied(outsider.query('SELECT pg_cancel_backend($1)',[pid]));
   await denied(broker.query(call,[pid]));
   await denied(reader.query(call,[pid]));

   const preTransfer=(await startSql(B,root,pid,1171,1.1)).pending;
   await denied(outsider.query(call,[pid]));
   assert.deepEqual(await preTransfer,{marker:1171},'unprivileged owner cannot cancel live victim SQL');

   // Owner promotion changes the SECURITY DEFINER effective SQL identity,
   // but does NOT redo GRANTs or CREATE FUNCTION for the existing OID.
   await root.query('ALTER FUNCTION '+fn+' OWNER TO '+roles[2]);
   const afterTransfer=await snapshot(root);
   assert.equal(afterTransfer.oid,before.oid,'existing function identity remains');
   assert.notEqual(afterTransfer.acl,before.acl,'PostgreSQL rewrites grantor metadata on OWNER transfer');
   assert.ok(before.acl.includes(roles[3]+'=X/'+roles[1]),'outsider EXECUTE originally granted by old owner');
   assert.ok(afterTransfer.acl.includes(roles[3]+'=X/'+roles[2]),'same outsider EXECUTE with new grantor');
   assert.equal(afterTransfer.owner,roles[2]);
   assert.equal(afterTransfer.prosecdef,true);
   assert.equal((await root.query('SELECT has_function_privilege($1,$2,$3) yes',
    [roles[3],fn,'EXECUTE'])).rows[0].yes,true);

   const promoted=(await startSql(B,root,pid,1172,6)).pending;
   assert.equal((await outsider.query(call,[pid])).rows[0].cancelled,true);
   assert.equal((await promoted).error?.code,'57014');
   assert.equal((await B.query('SELECT 117 AS recovered')).rows[0].recovered,117);

   // Reverse the elevated OWNER's victim-role membership while caller
   // retains EXECUTE. It must cease to authorize cancellation immediately.
   await root.query('REVOKE '+roles[0]+' FROM '+roles[2]);
   assert.equal((await root.query('SELECT has_function_privilege($1,$2,$3) yes',
    [roles[3],fn,'EXECUTE'])).rows[0].yes,true);
   const deprivileged=(await startSql(B,root,pid,1173,1.1)).pending;
   await denied(outsider.query(call,[pid]));
   assert.deepEqual(await deprivileged,{marker:1173});
   await root.query('GRANT '+roles[0]+' TO '+roles[2]+
    ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');

   // Separately revoke the CALLER's function privilege while the owner is
   // once again elevated: another independent fail-closed boundary.
   await root.query('REVOKE EXECUTE ON FUNCTION '+fn+' FROM '+roles[3]);
   await denied(outsider.query(call,[pid]));
   const stillLive=(await startSql(B,root,pid,1174,1.2)).pending;
   await denied(outsider.query(call,[pid]));
   assert.deepEqual(await stillLive,{marker:1174});
  }finally{B.release()}

  await denied(outsider.query('UPDATE '+guard+
    ".anchor SET approved=true WHERE id='fictional'"));
  await guardianOwner.query('BEGIN');
  try{
   const changed=await guardianOwner.query('UPDATE '+guard+
    ".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(changed.rowCount,1);await guardianOwner.query('COMMIT');
  }catch(e){await guardianOwner.query('ROLLBACK').catch(()=>{});throw e}
  const row=(await reader.query('SELECT approved,generation FROM '+guard+
   ".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(row,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR117_PG16_SECDEF_OWNER_TRANSFER_UNCHANGED_EXECUTE_ACL_CANCEL_NO_GO',
   postgresMajor:16,restrictedLoginSessions:5,oldAndNewOwnersNoLogin:true,
   stableSessionUserDuringSetRole:true,globalCreatorDefaultPublicRevoke:true,
   explicitOutsiderExecuteBeforeTransfer:true,preTransferOwnerDeniedCancel42501:true,
   sameFunctionOidAcrossOwnerTransfer:true,aclGrantorRewrittenOnOwnerTransfer:true,
   outsiderEffectiveExecuteRetainedAfterOwnerTransfer:true,
   newElevatedOwnerPermitsExistingOutsiderCancel57014:true,
   revokeOwnerVictimMembershipStopsCancel42501:true,
   regrantOwnerMembershipWithoutCallerGrantStillDenies42501:true,
   guardianOwnerCommitGeneration:'2',actualPgPoolMaxOne:true,
   physicalBackendPidAndStartStableAcrossAtoB:true,
   requestAtoBEpochChangedTestOnly:true,serviceSuperuserGranted:false,
   globalPgSignalBackendGranted:false,
   productionRequestBoundCancelIAM:'NOT_IMPLEMENTED',
   osPidRecycling:'NOT_TESTED',nextWorkerdPhysicalSignal:'NOT_PROVEN',
   remoteCdnLastByteReceiverAck:'NOT_PROVEN',
   issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  await root.query('RESET ROLE').catch(()=>{});
  if(pool)await pool.end().catch(()=>{});
  for(const c of sessions)await c.end().catch(()=>{});
  if(rootOpen){
   await root.query('DROP OWNED BY '+roles.join(',')+' CASCADE').catch(()=>{});
   await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   await root.query('DROP SCHEMA IF EXISTS '+guard+' CASCADE').catch(()=>{});
   for(const role of [...roles].reverse())await root.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await root.end().catch(()=>{});
 }
});