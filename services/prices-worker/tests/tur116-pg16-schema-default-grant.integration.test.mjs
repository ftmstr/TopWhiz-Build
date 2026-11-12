import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

// TUR116 disposable PG16: schema DEFAULT GRANT can reopen PUBLIC EXECUTE
// despite role-global DEFAULT REVOKE; CREATE OR REPLACE preserves explicit
// secure ACL, while DROP+CREATE applies the latest default. No production
// SQL privileges or cancel RPC are changed.
const uri=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR116_DISPOSABLE_PG16!=='1'||
 !uri||uri.protocol!=='postgresql:'||
 !['localhost','127.0.0.1'].includes(uri.hostname)||
 uri.port!=='5432'||uri.pathname!=='/topwhiz_test'||
 decodeURIComponent(uri.username)!=='topwhiz_test'||uri.search||uri.hash)
 throw Error('TUR116 isolated localhost postgres:16 CI only');

const suffix=randomBytes(5).toString('hex');
const roles=['victim','creator','outsider','broker','guardian_reader','guardian_owner']
 .map(s=>'tw116_'+s+'_'+suffix);
const password=roles.map(()=>randomBytes(20).toString('hex'));
const gate='tw116_gate_'+suffix,guard='tw116_guard_'+suffix;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const signature=n=>gate+'.'+n+'(integer)';
const call=n=>'SELECT '+gate+'.'+n+'($1) AS cancelled';
const creation=(n,replace=false)=>
 'CREATE '+(replace?'OR REPLACE ':'')+'FUNCTION '+signature(n)+
 ' RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER '+
 'SET search_path = pg_catalog, pg_temp AS $fn$ BEGIN '+
 'RETURN pg_catalog.pg_cancel_backend($1); END; $fn$';
// PL/pgSQL function argument references are named for clarity; use in_pid.
const body=(n,replace=false)=>
 'CREATE '+(replace?'OR REPLACE ':'')+'FUNCTION '+gate+'.'+n+
 '(in_pid integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER '+
 'SET search_path = pg_catalog, pg_temp AS $fn$ BEGIN '+
 'RETURN pg_catalog.pg_cancel_backend(in_pid); END; $fn$';
async function active(root,pid,fragment){
 for(let i=0;i<160;i++){
  const s=(await root.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(s?.state==='active'&&s.query.includes(fragment))return;
  await sleep(25);
 }
 throw Error('Physical PG16 SQL never active: '+fragment);
}
async function ongoing(client,root,pid,marker,delay){
 const query=client.query('SELECT pg_sleep('+delay+'),'+marker+' AS marker')
  .then(r=>({marker:r.rows[0].marker}),error=>({error}));
 await active(root,pid,'pg_sleep('+delay+')');
 // Never return the Promise directly from async: Promise adoption would
 // complete the live SQL before cancellation, invalidating the experiment.
 return {promise:query};
}
async function deny(promise,code='42501'){
 await assert.rejects(promise,e=>e?.code===code);
}
async function can(root,who,n){
 return (await root.query('SELECT has_function_privilege($1,$2,$3) yes',
  [who,signature(n),'EXECUTE'])).rows[0].yes;
}
test('actual PG16 schema DEFAULT GRANT overrides global DEFAULT REVOKE, but CREATE OR REPLACE retains explicit ACL',{timeout:120000},async()=>{
 const root=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 const connections=[];let connected=false,pool;
 try{
  await root.connect();connected=true;
  const ver=Number((await root.query("SELECT current_setting('server_version_num') v")).rows[0].v);
  assert.ok(ver>=160000&&ver<170000,'actual PG16 only');
  for(let i=0;i<roles.length;i++){
   const type=i===1?'NOLOGIN':'LOGIN';
   await root.query('CREATE ROLE '+roles[i]+' '+type+
    ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'+
    (type==='LOGIN'?" PASSWORD '"+password[i]+"'":''));
  }
  await root.query('GRANT '+roles[0]+' TO '+roles[1]+
   ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  await root.query('CREATE SCHEMA '+gate+' AUTHORIZATION '+roles[1]);
  await root.query('REVOKE ALL ON SCHEMA '+gate+' FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+gate+' TO '+roles[2]+','+roles[3]);
  await root.query('CREATE SCHEMA '+guard+' AUTHORIZATION '+roles[5]);
  await root.query('CREATE TABLE '+guard+
   '.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await root.query('ALTER TABLE '+guard+'.anchor OWNER TO '+roles[5]);
  await root.query('REVOKE ALL ON SCHEMA '+guard+' FROM PUBLIC');
  await root.query('REVOKE ALL ON '+guard+'.anchor FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+guard+' TO '+roles[4]);
  await root.query('GRANT SELECT ON '+guard+'.anchor TO '+roles[4]);
  await root.query("INSERT INTO "+guard+".anchor VALUES('fictional',true,1)");

  const loginUrl=i=>{const v=new URL(process.env.TEST_DATABASE_URL);
   v.username=roles[i];v.password=password[i];return v.href};
  pool=new pg.Pool({connectionString:loginUrl(0),max:1,idleTimeoutMillis:30000});
  async function login(i){
   const c=new pg.Client({connectionString:loginUrl(i)});
   await c.connect();connections.push(c);
   const q=(await c.query("SELECT session_user,rolsuper,rolcreaterole,"+
    "pg_has_role(session_user,'pg_signal_backend','member') signal "+
    "FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.equal(q.session_user,roles[i]);assert.equal(q.rolsuper,false);
   assert.equal(q.rolcreaterole,false);assert.equal(q.signal,false);
   return c;
  }
  const outsider=await login(2),broker=await login(3),
    guardianReader=await login(4),guardianOwner=await login(5);

  // An additive schema-level GRANT makes a globally-revoked PUBLIC EXECUTE
  // usable for future functions created under the same effective role.
  await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+roles[1]+
    ' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
  await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+roles[1]+
    ' IN SCHEMA '+gate+' GRANT EXECUTE ON FUNCTIONS TO PUBLIC');
  const adminLogin=(await root.query('SELECT session_user AS s')).rows[0].s;
  await root.query('SET ROLE '+roles[1]);
  try{
   const identity=(await root.query('SELECT session_user AS s,current_user AS c')).rows[0];
   assert.equal(identity.s,adminLogin);assert.equal(identity.c,roles[1]);
   await root.query(body('schema_public'));
  }finally{await root.query('RESET ROLE')}
  assert.equal(await can(root,roles[2],'schema_public'),true);
  const oldOid=(await root.query('SELECT $1::regprocedure::oid AS oid',
   [signature('schema_public')])).rows[0].oid;
  const f=(await root.query('SELECT p.prosecdef,p.proowner::regrole::text AS owner '+
   'FROM pg_proc p WHERE p.oid=$1',[oldOid])).rows[0];
  assert.equal(f.prosecdef,true);assert.equal(f.owner,roles[1]);

  const A=await pool.connect();let pid,start;
  try{
   pid=(await A.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   start=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].backend_start;
   assert.equal((await A.query('SELECT 116 AS marker')).rows[0].marker,116);
  }finally{A.release()}
  const B=await pool.connect();
  try{
   const pidB=(await B.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const startB=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pidB])).rows[0].backend_start;
   assert.equal(pidB,pid);assert.equal(pool.totalCount,1);
   assert.equal(new Date(startB).getTime(),new Date(start).getTime());
   assert.notDeepEqual({pid,start,epoch:1,request:'A'},{pid,start:startB,epoch:2,request:'B'});

   await deny(outsider.query('SELECT pg_cancel_backend($1)',[pid]));
   const exposed=(await ongoing(B,root,pid,1161,6)).promise;
   const cancelled=(await outsider.query(call('schema_public'),[pid])).rows[0].cancelled;
   assert.equal(cancelled,true,'schema default grant opens privileged SECDEF PUBLIC EXECUTE');
   assert.equal((await exposed).error?.code,'57014');
   assert.equal((await B.query('SELECT 116 AS recovered')).rows[0].recovered,116);

   await root.query('REVOKE ALL ON FUNCTION '+signature('schema_public')+' FROM PUBLIC');
   assert.equal(await can(root,roles[2],'schema_public'),false);
   await deny(outsider.query(call('schema_public'),[pid]));

   // The schema DEFAULT GRANT remains enabled, but ALTER FUNCTION's
   // CREATE OR REPLACE is not creation of a new object: OID and ACL survive.
   await root.query('SET ROLE '+roles[1]);
   try{await root.query(body('schema_public',true))}
   finally{await root.query('RESET ROLE')}
   const replacementOid=(await root.query('SELECT $1::regprocedure::oid AS oid',
    [signature('schema_public')])).rows[0].oid;
   assert.equal(replacementOid,oldOid);
   assert.equal(await can(root,roles[2],'schema_public'),false);
   await deny(outsider.query(call('schema_public'),[pid]));

   // Remove the additive schema-level GRANT: this affects only functions
   // created later, not the first published function and its old ACL.
   await root.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+roles[1]+
    ' IN SCHEMA '+gate+' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
   assert.equal(await can(root,roles[2],'schema_public'),false);
   await root.query('SET ROLE '+roles[1]);
   try{
    await root.query('DROP FUNCTION '+signature('schema_public'));
    await root.query(body('recreated_safe'));
   }finally{await root.query('RESET ROLE')}
   assert.equal(await can(root,roles[2],'recreated_safe'),false);
   await deny(outsider.query(call('recreated_safe'),[pid]));

   // A deliberate individual EXECUTE grant still does not bind broker to B.
   await root.query('GRANT EXECUTE ON FUNCTION '+signature('recreated_safe')+
     ' TO '+roles[3]);
   const live=(await ongoing(B,root,pid,1162,6)).promise;
   const wrongRequest=(await broker.query(call('recreated_safe'),[pid])).rows[0].cancelled;
   assert.equal(wrongRequest,true);
   assert.equal((await live).error?.code,'57014');
   await root.query('REVOKE EXECUTE ON FUNCTION '+signature('recreated_safe')+
     ' FROM '+roles[3]);
   await deny(broker.query(call('recreated_safe'),[pid]));
   const after=(await ongoing(B,root,pid,1163,1.2)).promise;
   await deny(broker.query(call('recreated_safe'),[pid]));
   assert.deepEqual(await after,{marker:1163});
  }finally{B.release()}

  await deny(outsider.query('UPDATE '+guard+
   ".anchor SET approved=true WHERE id='fictional'"));
  await guardianOwner.query('BEGIN');
  try{
   const x=await guardianOwner.query('UPDATE '+guard+
    ".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(x.rowCount,1);await guardianOwner.query('COMMIT');
  }catch(e){await guardianOwner.query('ROLLBACK').catch(()=>{});throw e}
  const last=(await guardianReader.query(
   'SELECT approved,generation FROM '+guard+".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(last,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR116_PG16_SCHEMA_DEFAULT_GRANT_AND_FUNCTION_REPLACE_ACL_NO_GO',
   postgresMajor:16,independentRestrictedLogins:5,definerNoLogin:true,
   sameSessionUserDifferentCurrentCreator:true,
   creatorGlobalDefaultPublicRevoke:true,schemaDefaultPublicGrantReenabled:true,
   outsiderDirectCancelDenied42501:true,outsiderFunctionCancel57014:true,
   explicitFunctionRevokeRestores42501:true,
   createOrReplacePreservedSameOidAndRevokedAcl:true,
   schemaDefaultRevokeFutureOnly:true,
   dropRecreateAfterSchemaGrantRemovalDeniedPublic42501:true,
   explicitBrokerExecCancelledOtherRequest57014:true,
   brokerRevokeRestored42501:true,realPgPoolMaxOne:true,
   samePidAndBackendStartAcrossAandB:true,
   guardedBFinalMarker:1163,guardianOwnerGeneration:'2',
   pgSignalBackendGranted:false,serviceSuperuserGranted:false,
   productionRequestScopedIAM:'NOT_PROVEN',osPidRecycling:'NOT_TESTED',
   productionNextWorkerSignal:'NOT_PROVEN',cdnLastByteReceiverACK:'NOT_PROVEN',
   issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  await root.query('RESET ROLE').catch(()=>{});
  if(pool)await pool.end().catch(()=>{});
  for(const c of connections)await c.end().catch(()=>{});
  if(connected){
   await root.query('DROP SCHEMA IF EXISTS '+gate+' CASCADE').catch(()=>{});
   await root.query('DROP SCHEMA IF EXISTS '+guard+' CASCADE').catch(()=>{});
   for(const role of [...roles].reverse())await root.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await root.end().catch(()=>{});
 }
});