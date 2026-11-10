import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes} from 'node:crypto';

// Real disposable PG16. Same-role credentials are NOT request-specific IAM:
// they can cancel a *different* active sibling connection by backend PID.
let url;try{url=new URL(process.env.TEST_DATABASE_URL)}catch{}
if(process.env.CI!=='true'||!url||url.protocol!=='postgresql:'||
   !['localhost','127.0.0.1'].includes(url.hostname)||
   (url.port&&url.port!=='5432')||url.search||url.hash)
 throw Error('TUR074 requires disposable localhost PG16 only');
const suffix=randomBytes(5).toString('hex');
const names=['media_reader','media_owner','guard_reader','guard_owner']
  .map(x=>'tw074_'+x+'_'+suffix);
const passwords=names.map(()=>randomBytes(20).toString('hex'));
const m='tw074_media_'+suffix,g='tw074_guard_'+suffix;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function assertRunning(admin,pid,sql){
 for(let i=0;i<100;i++){
  const active=(await admin.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(active?.state==='active'&&active.query.includes(sql))return;
  await delay(20);
 }
 throw Error('expected real PG16 active SQL query '+sql);
}

test('TUR074 actual PG16: shared media role can cancel a different HTTP-request sibling, despite guardian IAM isolation',{timeout:120000},async()=>{
 const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 const sessions=[];let started=false;
 try{
  await admin.connect();started=true;
  for(let i=0;i<names.length;i++)
   await admin.query('CREATE ROLE '+names[i]+
     " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+passwords[i]+"'");
  await admin.query('CREATE SCHEMA '+m);
  await admin.query('CREATE TABLE '+m+'.media(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await admin.query('ALTER TABLE '+m+'.media OWNER TO '+names[1]);
  await admin.query('REVOKE ALL ON SCHEMA '+m+' FROM PUBLIC');
  await admin.query('GRANT USAGE ON SCHEMA '+m+' TO '+names[0]);
  await admin.query('GRANT SELECT ON '+m+'.media TO '+names[0]);
  await admin.query('CREATE SCHEMA '+g+' AUTHORIZATION '+names[3]);
  await admin.query('CREATE TABLE '+g+'.guardian(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await admin.query('ALTER TABLE '+g+'.guardian OWNER TO '+names[3]);
  await admin.query('REVOKE ALL ON SCHEMA '+g+' FROM PUBLIC');
  await admin.query('REVOKE ALL ON '+g+'.guardian FROM PUBLIC');
  await admin.query('GRANT USAGE ON SCHEMA '+g+' TO '+names[2]);
  await admin.query('GRANT SELECT ON '+g+'.guardian TO '+names[2]);
  await admin.query('INSERT INTO '+m+".media VALUES('ci-asset',true,1)");
  await admin.query('INSERT INTO '+g+".guardian VALUES('ci-asset',true,1)");
  async function login(n){
   const u=new URL(process.env.TEST_DATABASE_URL);
   u.username=names[n];u.password=passwords[n];
   const c=new pg.Client({connectionString:u.href});
   await c.connect();sessions.push(c);
   const a=(await c.query('SELECT session_user,rolsuper,rolcreaterole,'+
      "pg_has_role(session_user,'pg_signal_backend','member') AS can_signal "+
      'FROM pg_roles WHERE rolname=session_user')).rows[0];
   assert.equal(a.session_user,names[n]);
   assert.equal(a.rolsuper,false);
   assert.equal(a.rolcreaterole,false);
   assert.equal(a.can_signal,false,'no broad pg_signal_backend');
   return c;
  }
  const requestA=await login(0),requestB=await login(0),sameRoleCanceller=await login(0),
        mediaOwner=await login(1),guardianReader=await login(2),guardianOwner=await login(3);
  const pidA=(await requestA.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const pidB=(await requestB.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  assert.notEqual(pidA,pidB);
  const aQuery=requestA.query('SELECT pg_sleep(2.5),74 AS marker').then(
    r=>({marker:r.rows[0].marker}),error=>({error}));
  const bQuery=requestB.query('SELECT pg_sleep(9),75 AS marker').then(
    r=>({marker:r.rows[0].marker}),error=>({error}));
  await assertRunning(admin,pidA,'pg_sleep(2.5)');
  await assertRunning(admin,pidB,'pg_sleep(9)');
  await assert.rejects(guardianReader.query('SELECT pg_cancel_backend($1)',[pidB]),
   /permission denied|must be a member|not allowed/i);
  await assert.rejects(mediaOwner.query('SELECT pg_cancel_backend($1)',[pidB]),
   /permission denied|must be a member|not allowed/i);
  // The threat: a role-shared canceler does NOT need to own request B.
  const cancel=await sameRoleCanceller.query(
   'SELECT pg_cancel_backend($1) AS cancelled',[pidB]);
  assert.equal(cancel.rows[0].cancelled,true);
  const b=await bQuery;assert.equal(b.error?.code,'57014');
  const a=await aQuery;assert.deepEqual(a,{marker:74});
  assert.equal((await requestB.query('SELECT 75 AS recovered')).rows[0].recovered,75);
  await assert.rejects(sameRoleCanceller.query(
   'UPDATE '+g+".guardian SET approved=true WHERE id='ci-asset'"),/permission denied/i);
  const guardianActualOwner=(await admin.query(
   'SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass',
   [g+'.guardian'])).rows[0].owner;
  assert.equal(guardianActualOwner,names[3]);
  await guardianOwner.query('BEGIN');
  try{
   const changed=await guardianOwner.query('UPDATE '+g+
    ".guardian SET approved=false,generation=2 WHERE id='ci-asset' AND approved=true AND generation=1");
   assert.equal(changed.rowCount,1);
   await guardianOwner.query('COMMIT');
  }catch(e){await guardianOwner.query('ROLLBACK').catch(()=>{});throw e}
  const confirmed=(await guardianReader.query('SELECT approved,generation FROM '+
    g+".guardian WHERE id='ci-asset'")).rows[0];
  assert.deepEqual(confirmed,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR074_ACTUAL_PG16_SAME_ROLE_CROSS_REQUEST_CANCEL_NEGATIVE',
   independentNonSuperuserRoles:4,authenticatedSessions:6,
   requestBackendsDistinctAndActive:true,pgSignalBackendGranted:false,
   unrelatedMediaOwnerCancelDenied:true,guardianReaderCancelDenied:true,
   sameRoleCancellerCancelledSiblingWithoutRequestAuthorization:true,
   siblingSqlState:b.error.code,untargetedRequestACompleted:a.marker,
   siblingConnectionStillUsable:true,guardianSchemaOwnerIndependent:true,
   acknowledgedLocalGuardianRevokeGeneration:confirmed.generation,
   perRequestCancellationIAM:'NO_GO_SHARED_ROLE_CAN_CANCEL_SIBLING',
   pooledPidReuse:'NOT_PROVEN_SAFE',
   physicalNextWorkerDisconnect:'INHERITED_NOT_PROVEN',
   originalOutboxShaQueueDlq:'INHERITED_CI',
   cdnLastByteRemoteAck:'NOT_PROVEN',issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  for(const c of sessions)await c.end().catch(()=>{});
  if(started){
   await admin.query('DROP SCHEMA IF EXISTS '+m+' CASCADE').catch(()=>{});
   await admin.query('DROP SCHEMA IF EXISTS '+g+' CASCADE').catch(()=>{});
   for(const role of [...names].reverse())
    await admin.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await admin.end().catch(()=>{});
 }
});
