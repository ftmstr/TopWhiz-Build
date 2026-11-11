import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

/**
 * TUR097: REAL disposable PG16 role-membership cancellation boundary.
 * Novel vs TUR096: dynamically toggle role membership INHERIT/SET flags
 * between independent SQL LOGINs during an actual pg.Pool(max=1) handoff.
 * Mere "separate logins" can lose cancellation isolation if inherited role
 * privilege or SET ROLE was mistakenly granted. Positive denied controls
 * plus real SQLSTATE 57014; no pg_signal_backend and no production IAM.
 */
const uri=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR097_DISPOSABLE_PG16!=='1'||
 !uri||uri.protocol!=='postgresql:'||
 !['localhost','127.0.0.1'].includes(uri.hostname)||
 (uri.port&&uri.port!=='5432')||uri.pathname!=='/topwhiz_test'||
 decodeURIComponent(uri.username)!=='topwhiz_test'||uri.search||uri.hash)
 throw Error('TUR097: explicit disposable localhost PostgreSQL16 test required');

const unique=randomBytes(5).toString('hex');
const roles=['target','delegate','outsider','guardian_reader','guardian_owner']
 .map(label=>'tw097_'+label+'_'+unique);
const passes=roles.map(()=>randomBytes(20).toString('hex'));
const guardian='tw097_guard_'+unique;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function assertActive(admin,pid,sql){
 for(let i=0;i<150;i++){
  const row=(await admin.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(row?.state==='active'&&row.query.includes(sql))return;
  await wait(20);
 }
 throw Error('expected real PG16 query never active: '+sql);
}
async function assertDenied(client,pid){
 await assert.rejects(client.query('SELECT pg_cancel_backend($1) AS cancelled',[pid]),
   err=>err?.code==='42501','without inherited/SET authority 42501 required');
}
function ticketIsCurrent(t,c){
 return t.pid===c.pid&&t.epoch===c.epoch&&t.request===c.request&&t.login===c.login;
}
async function phaseSql(target,admin,pid,tag,seconds){
 const p=target.query('SELECT pg_sleep('+seconds+'),'+tag+' AS marker').then(
  row=>({marker:row.rows[0].marker}),error=>({error}));
 await assertActive(admin,pid,'pg_sleep('+seconds+')');
 return p;
}
const membershipSql=(name)=>"SELECT pg_has_role(session_user,'"+name+"','MEMBER') AS is_member,"+
 "pg_has_role(session_user,'"+name+"','USAGE') AS can_inherit,"+
 "pg_has_role(session_user,'"+name+"','SET') AS can_set";

test('real PG16: independent LOGIN loses pg_cancel_backend isolation through INHERIT or SET membership, revoked grants restore denial',{timeout:120000},async()=>{
 const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 let ready=false,pool;
 const sessions=[];
 try{
  await admin.connect();ready=true;
  const server=Number((await admin.query("SELECT current_setting('server_version_num') v")).rows[0].v);
  assert.ok(server>=160000&&server<170000,'real Postgres 16 only');
  for(let i=0;i<roles.length;i++)
   await admin.query('CREATE ROLE '+roles[i]+
    " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+passes[i]+"'");
  await admin.query('CREATE SCHEMA '+guardian+' AUTHORIZATION '+roles[4]);
  await admin.query('CREATE TABLE '+guardian+'.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await admin.query('ALTER TABLE '+guardian+'.anchor OWNER TO '+roles[4]);
  await admin.query('REVOKE ALL ON SCHEMA '+guardian+' FROM PUBLIC');
  await admin.query('REVOKE ALL ON '+guardian+'.anchor FROM PUBLIC');
  await admin.query('GRANT USAGE ON SCHEMA '+guardian+' TO '+roles[3]);
  await admin.query('GRANT SELECT ON '+guardian+'.anchor TO '+roles[3]);
  await admin.query("INSERT INTO "+guardian+".anchor VALUES('fictional',true,1)");
  function url(i){const u=new URL(process.env.TEST_DATABASE_URL);u.username=roles[i];u.password=passes[i];return u.href}
  pool=new pg.Pool({connectionString:url(0),max:1,idleTimeoutMillis:30000});
  async function login(i){
   const c=new pg.Client({connectionString:url(i)});await c.connect();sessions.push(c);
   const v=(await c.query("SELECT session_user,rolsuper,rolcreaterole,pg_has_role(session_user,'pg_signal_backend','member') AS broad FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.equal(v.session_user,roles[i]);assert.equal(v.rolsuper,false);
   assert.equal(v.rolcreaterole,false);assert.equal(v.broad,false);
   return c;
  }
  const delegated=await login(1),outsider=await login(2),
   guardianReader=await login(3),guardianOwner=await login(4);
  // A and B are DIFFERENT application requests on the real SAME pooled backend.
  const A=await pool.connect();
  const oldPid=(await A.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  assert.equal((await A.query('SELECT 97 AS completed')).rows[0].completed,97);
  A.release();
  const B=await pool.connect();
  let bHeld=true;
  try{
   const pid=(await B.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   assert.equal(pid,oldPid,'actual pg.Pool retains physical PID across checkouts');
   assert.equal(pool.totalCount,1);
   const stale={pid,epoch:1,request:'A',login:roles[0]},
     latest={pid,epoch:2,request:'B',login:roles[0]};
   assert.equal(ticketIsCurrent(stale,latest),false,'test-only lease rejects old A ticket');
   assert.equal(ticketIsCurrent(latest,latest),true);
   const initial=await phaseSql(B,admin,pid,971,1.0);
   await assertDenied(delegated,pid);
   await assertDenied(outsider,pid);
   assert.deepEqual(await initial,{marker:971});

   // Membership itself does not imply privileges if *both* options are FALSE.
   await admin.query('GRANT '+roles[0]+' TO '+roles[1]+' WITH INHERIT FALSE, SET FALSE');
   const first=(await delegated.query(membershipSql(roles[0]))).rows[0];
   assert.deepEqual(first,{is_member:true,can_inherit:false,can_set:false});
   await assert.rejects(delegated.query('SET ROLE '+roles[0]),
     error=>error?.code==='42501','SET FALSE must prohibit role switch');
   const b1=await phaseSql(B,admin,pid,972,1.0);
   await assertDenied(delegated,pid);
   assert.deepEqual(await b1,{marker:972});

   // A single GRANT option change now exposes target backend to a different LOGIN.
   await admin.query('GRANT '+roles[0]+' TO '+roles[1]+' WITH INHERIT TRUE, SET FALSE');
   const inherited=(await delegated.query(membershipSql(roles[0]))).rows[0];
   assert.deepEqual(inherited,{is_member:true,can_inherit:true,can_set:false});
   const b2=await phaseSql(B,admin,pid,973,7);
   const inheritedCancel=await delegated.query('SELECT pg_cancel_backend($1) cancelled',[pid]);
   assert.equal(inheritedCancel.rows[0].cancelled,true);
   assert.equal((await b2).error?.code,'57014');

   // Grant revocation must revoke the different login's direct cancellation power.
   await admin.query('REVOKE '+roles[0]+' FROM '+roles[1]);
   const gone=(await delegated.query(membershipSql(roles[0]))).rows[0];
   assert.deepEqual(gone,{is_member:false,can_inherit:false,can_set:false});
   const b3=await phaseSql(B,admin,pid,974,1.0);
   await assertDenied(delegated,pid);
   assert.deepEqual(await b3,{marker:974});

   // INHERIT FALSE alone is insufficient if SET TRUE lets delegated login
   // switch current_user to the target and call pg_cancel_backend.
   await admin.query('GRANT '+roles[0]+' TO '+roles[1]+' WITH INHERIT FALSE, SET TRUE');
   const switchable=(await delegated.query(membershipSql(roles[0]))).rows[0];
   assert.deepEqual(switchable,{is_member:true,can_inherit:false,can_set:true});
   const b4=await phaseSql(B,admin,pid,975,7);
   await assertDenied(delegated,pid);
   await delegated.query('SET ROLE '+roles[0]);
   const assumed=(await delegated.query('SELECT session_user login,current_user effective')).rows[0];
   assert.equal(assumed.login,roles[1]);
   assert.equal(assumed.effective,roles[0]);
   const switched=await delegated.query('SELECT pg_cancel_backend($1) cancelled',[pid]);
   assert.equal(switched.rows[0].cancelled,true);
   assert.equal((await b4).error?.code,'57014');
   await delegated.query('RESET ROLE');
   const b5=await phaseSql(B,admin,pid,976,1.0);
   await assertDenied(delegated,pid);
   assert.deepEqual(await b5,{marker:976});

   await admin.query('REVOKE '+roles[0]+' FROM '+roles[1]);
   const b6=await phaseSql(B,admin,pid,977,1.0);
   await assertDenied(delegated,pid);
   await assertDenied(outsider,pid);
   assert.deepEqual(await b6,{marker:977});
   assert.equal((await B.query('SELECT 97 AS recovered')).rows[0].recovered,97);
  } finally {if(bHeld)B.release()}

  await assert.rejects(delegated.query(
   'UPDATE '+guardian+".anchor SET approved=true WHERE id='fictional'"),
   error=>error?.code==='42501');
  await guardianOwner.query('BEGIN');
  try{
   const changed=await guardianOwner.query('UPDATE '+guardian+
    ".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(changed.rowCount,1);await guardianOwner.query('COMMIT');
  }catch(error){await guardianOwner.query('ROLLBACK').catch(()=>{});throw error}
  const anchor=(await guardianReader.query('SELECT approved,generation FROM '+guardian+
   ".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(anchor,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR097_REAL_PG16_ROLE_MEMBERSHIP_CANCELLATION_IAM_NO_GO',
   postgresMajor:16,actualPgPoolMax1:true,requestAandBPhysicalBackendSame:true,
   applicationEpochDeniedStaleA:true,independentLoginNoGrantSqlstate:'42501',
   membershipInheritFalseSetFalseRemainsDenied:true,
   inheritedMemberDifferentLoginCancelsOtherSession:true,inheritedCancelSqlstate:'57014',
   grantRevocationRestoresDenial:true,
   nonInheritedSetTrueAllowsEscalationViaSetRole:true,setRoleCancelSqlstate:'57014',
   resetRoleRestoresDenial:true,secondRevokeRestoresDenial:true,
   otherUnrelatedLoginNeverCanCancel:true,restrictedDistinctLogins:5,
   pgSignalBackendGranted:false,independentGuardianOwnerGeneration:anchor.generation,
   globalRoleGrants:'TEMPORARY_TEST_ONLY',
   transactionCommitUnknown:'INHERITED_CI',originalImmutableOutbox:'INHERITED_CI',
   requestScopedProductionIAM:'NOT_PROVEN',osPidRecycling:'NOT_PROVEN',
   physicalHttpDisconnect:'INHERITED_TUR095',
   workerRequestSignal:'NOT_PROVEN',remoteReceiverLastByte:'NOT_PROVEN',
   issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  if(pool)await pool.end().catch(()=>{});
  for(const c of sessions)await c.end().catch(()=>{});
  if(ready){
   await admin.query('DROP SCHEMA IF EXISTS '+guardian+' CASCADE').catch(()=>{});
   for(const role of [...roles].reverse())await admin.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await admin.end().catch(()=>{});
 }
});
