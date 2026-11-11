import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

// TUR098: actual disposable PostgreSQL16 membership ADMIN option and CASCADE.
// No production grants and no pg_signal_backend grants.
const url=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR098_DISPOSABLE_PG16!=='1'||
 !url||url.protocol!=='postgresql:'||!['127.0.0.1','localhost'].includes(url.hostname)||
 (url.port&&url.port!=='5432')||url.pathname!=='/topwhiz_test'||
 decodeURIComponent(url.username)!=='topwhiz_test'||url.search||url.hash)
 throw Error('TUR098 requires explicit disposable localhost PostgreSQL16');
const suffix=randomBytes(5).toString('hex');
const roles=['victim','delegate','recipient','guardian_reader','guardian_owner'].map(n=>'tw098_'+n+'_'+suffix);
const passwords=roles.map(()=>randomBytes(20).toString('hex'));
const schema='tw098_g_'+suffix;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function active(root,pid,text){
 for(let i=0;i<160;i++){
  const v=(await root.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(v?.state==='active'&&v.query.includes(text))return;
  await sleep(25);
 }
 throw Error('No active PostgreSQL16 SQL: '+text);
}
async function targetSql(c,root,pid,marker,seconds){
 const result=c.query('SELECT pg_sleep('+seconds+'),'+marker+' AS marker').then(
   v=>({marker:v.rows[0].marker}),e=>({error:e}));
 await active(root,pid,'pg_sleep('+seconds+')');
 return {promise:result};
}
async function denied(client,pid){
 await assert.rejects(client.query('SELECT pg_cancel_backend($1) AS cancelled',[pid]),e=>e?.code==='42501');
}
async function membership(root,role,member){
 return (await root.query(
  'SELECT a.admin_option,a.inherit_option,a.set_option,g.rolname AS grantor '+
  'FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid '+
  'JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor '+
  'WHERE r.rolname=$1 AND m.rolname=$2 ORDER BY g.rolname',
  [role,member])).rows;
}
test('real PG16 non-inheriting ADMIN member delegates unauthorized query cancel; REVOKE CASCADE removes it',{timeout:120000},async()=>{
 const root=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 const live=[];let rootReady=false,pool;
 try{
  await root.connect();rootReady=true;
  const ver=Number((await root.query("SELECT current_setting('server_version_num') n")).rows[0].n);
  assert.ok(ver>=160000&&ver<170000,'must use true PostgreSQL16');
  for(let i=0;i<roles.length;i++)
   await root.query('CREATE ROLE '+roles[i]+
     " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+passwords[i]+"'");
  await root.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+roles[4]);
  await root.query('CREATE TABLE '+schema+'.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await root.query('ALTER TABLE '+schema+'.anchor OWNER TO '+roles[4]);
  await root.query('REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC');
  await root.query('REVOKE ALL ON '+schema+'.anchor FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+schema+' TO '+roles[3]);
  await root.query('GRANT SELECT ON '+schema+'.anchor TO '+roles[3]);
  await root.query("INSERT INTO "+schema+".anchor VALUES('fictional',true,1)");
  function loginUrl(i){const u=new URL(process.env.TEST_DATABASE_URL);u.username=roles[i];u.password=passwords[i];return u.href}
  pool=new pg.Pool({connectionString:loginUrl(0),max:1,idleTimeoutMillis:30000});
  async function login(i){
   const c=new pg.Client({connectionString:loginUrl(i)});await c.connect();live.push(c);
   const row=(await c.query(
    "SELECT session_user,rolsuper,rolcreaterole,pg_has_role(session_user,'pg_signal_backend','member') AS signal "+
    "FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.equal(row.session_user,roles[i]);assert.equal(row.rolsuper,false);
   assert.equal(row.rolcreaterole,false);assert.equal(row.signal,false);
   return c;
  }
  const delegate=await login(1),recipient=await login(2),
   guardianReader=await login(3),guardianOwner=await login(4);
  // Physical real pg.Pool checkout A, release and checkout B.
  const A=await pool.connect();
  let pid,started;
  try{
   pid=(await A.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   started=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].backend_start;
   assert.equal((await A.query('SELECT 98 AS done')).rows[0].done,98);
  }finally{A.release()}
  const B=await pool.connect();
  try{
   const pidB=(await B.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   assert.equal(pidB,pid);
   assert.equal(pool.totalCount,1);
   const s=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].backend_start;
   assert.equal(new Date(s).getTime(),new Date(started).getTime());
   const leaseA={pid,backendStart:new Date(started).toISOString(),epoch:1,request:'A'};
   const leaseB={pid,backendStart:new Date(s).toISOString(),epoch:2,request:'B'};
   assert.notDeepEqual(leaseA,leaseB,'app lease alone is not PG cancel authorization');
   const before=(await targetSql(B,root,pid,981,1)).promise;
   await denied(delegate,pid);await denied(recipient,pid);
   await denied(guardianReader,pid);
   assert.deepEqual(await before,{marker:981});
   // ADMIN alone is not direct INHERIT or SET, but can delegate membership.
   await root.query('GRANT '+roles[0]+' TO '+roles[1]+' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');
   const direct=await membership(root,roles[0],roles[1]);
   assert.equal(direct.length,1);assert.equal(direct[0].admin_option,true);
   assert.equal(direct[0].inherit_option,false);assert.equal(direct[0].set_option,false);
   await assert.rejects(delegate.query('SET ROLE '+roles[0]),e=>e?.code==='42501');
   const beforeGrant=(await targetSql(B,root,pid,982,1)).promise;
   await denied(delegate,pid);await denied(recipient,pid);
   assert.deepEqual(await beforeGrant,{marker:982});
   // Non-superuser delegate supplies third-party membership.
   await delegate.query('GRANT '+roles[0]+' TO '+roles[2]+' WITH ADMIN FALSE, INHERIT TRUE, SET TRUE');
   const delegated=await membership(root,roles[0],roles[2]);
   assert.equal(delegated.length,1);
   assert.equal(delegated[0].grantor,roles[1]);
   assert.equal(delegated[0].inherit_option,true);
   assert.equal(delegated[0].admin_option,false);
   assert.equal((await recipient.query('SELECT pg_has_role(session_user,$1,$2) permitted',
    [roles[0],'USAGE'])).rows[0].permitted,true);
   const bActive=(await targetSql(B,root,pid,983,7)).promise;
   assert.equal((await recipient.query('SELECT pg_cancel_backend($1) cancelled',[pid])).rows[0].cancelled,true);
   assert.equal((await bActive).error?.code,'57014');
   assert.equal((await B.query('SELECT 98 AS usable')).rows[0].usable,98);
   // PG16 dependency-sensitive revocation: RESTRICT fails, CASCADE removes downstream.
   await assert.rejects(root.query('REVOKE ADMIN OPTION FOR '+roles[0]+' FROM '+roles[1]+' RESTRICT'),
    e=>e?.code==='2BP01');
   await root.query('REVOKE ADMIN OPTION FOR '+roles[0]+' FROM '+roles[1]+' CASCADE');
   const original=await membership(root,roles[0],roles[1]);
   assert.equal(original.length,1);
   assert.equal(original[0].admin_option,false);
   assert.equal(original[0].inherit_option,false);
   assert.equal(original[0].set_option,false);
   assert.equal((await membership(root,roles[0],roles[2])).length,0);
   await assert.rejects(delegate.query('GRANT '+roles[0]+' TO '+roles[2]),
    e=>e?.code==='42501');
   const after=(await targetSql(B,root,pid,984,1)).promise;
   await denied(delegate,pid);await denied(recipient,pid);
   await denied(guardianReader,pid);
   assert.deepEqual(await after,{marker:984});
  }finally{B.release()}
  await assert.rejects(delegate.query(
   'UPDATE '+schema+".anchor SET approved=true WHERE id='fictional'"),
   e=>e?.code==='42501');
  await guardianOwner.query('BEGIN');
  try{
   const x=await guardianOwner.query('UPDATE '+schema+
    ".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(x.rowCount,1);await guardianOwner.query('COMMIT');
  }catch(e){await guardianOwner.query('ROLLBACK').catch(()=>{});throw e}
  const final=(await guardianReader.query(
   'SELECT approved,generation FROM '+schema+".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(final,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR098_REAL_PG16_ADMIN_GRANT_CASCADE_CANCEL_NEGATIVE',
   postgresMajor:16,actualPgPoolMax1:true,samePhysicalBackendAndBackendStart:true,
   staleAppEpochTestOnly:true,independentLoginInitiallyDenied42501:true,
   adminTrueInheritFalseSetFalseInitiallyDenied:true,
   authenticatedDelegateGrantorVerified:true,thirdPartyInheritedCancellation57014:true,
   restrictDependencyDenied2BP01:true,revokeAdminCascadeRemovedDependentGrant:true,
   afterRevokeCancellationDenied42501:true,guardianOwnerCommitGeneration:'2',
   restrictedLogins:5,pgSignalBackendGranted:false,
   osPidRecycling:'NOT_TESTED',productionCancelIAM:'NOT_IMPLEMENTED',
   realNextWorkerRequestSignal:'NOT_PROVEN',remoteReceiverLastByte:'NOT_PROVEN',
   issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  if(pool)await pool.end().catch(()=>{});
  for(const c of live)await c.end().catch(()=>{});
  if(rootReady){
   await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   for(const role of [...roles].reverse())
    await root.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await root.end().catch(()=>{});
 }
});