import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
// TEST-ONLY non-atomic SECURITY DEFINER. NEVER production cancellation IAM.
const raw=process.env.TEST_DATABASE_URL||'';
const u=(()=>{try{return new URL(raw)}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR150_DISPOSABLE_PG16!=='1'||
 !u||u.protocol!=='postgresql:'||!['localhost','127.0.0.1'].includes(u.hostname)||
 u.port!=='5432'||u.pathname!=='/topwhiz_test'||
 decodeURIComponent(u.username)!=='topwhiz_test'||u.search||u.hash)
 throw Error('TUR150 disposable localhost PG16 explicit opt-in required');
const suffix=randomBytes(5).toString('hex');
const keys=['broker','executor','owner','rights','a','b','c'];
const role=Object.fromEntries(keys.map(k=>[k,'tw150_'+k+'_'+suffix]));
const pass=Object.fromEntries(['broker','rights','a','b','c'].map(k=>[k,randomBytes(18).toString('hex')]));
const nonce=Object.fromEntries(['a','b','c'].map(k=>[k,randomBytes(18).toString('hex')]));
const schema='tw150_'+suffix,lease=schema+'.lease';
const sig=schema+'.doublecheck_cancel(integer,timestamptz,text,text,integer,bigint,bigint)';
const call='SELECT '+schema+'.doublecheck_cancel($1,$2,$3,$4,$5,$6,$7) AS ok';
const login=k=>{const x=new URL(raw);x.username=role[k];x.password=pass[k];return x.href};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const settle=p=>p.then(value=>({value}),error=>({code:error?.code,message:error?.message}));
async function waiting(root,pid,key){
 for(let i=0;i<200;i++){
  const r=await root.query("SELECT count(*)::integer AS n FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted AND objid=$2::oid",[pid,key]);
  if(r.rows[0].n)return;
  await sleep(25);
 }
 throw Error('Physical PG16 advisory barrier not reached: '+key);
}
async function active(root,pid,marker){
 for(let i=0;i<200;i++){
  const x=(await root.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(x?.state==='active'&&x.query.includes(marker))return;
  await sleep(25);
 }
 throw Error('Physical SQL not active: '+marker);
}
async function started(root,pid){
 const x=(await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
 assert.ok(x);return new Date(x.backend_start).getTime();
}
async function denied(p){await assert.rejects(p,e=>e?.code==='42501')}
test('TUR150 real PG16 second-check-to-pg_cancel_backend races reused A-B-C backend',
{timeout:140000},async()=>{
 const root=new pg.Client({connectionString:raw});
 let rootReady=false,pool,clientA;
 const sessions=[];
 const seed=430000000+randomBytes(3).readUIntBE(0,3);
 const p1=seed,p2=seed+1,p3=seed+2,p4=seed+3;
 try{
  await root.connect();rootReady=true;
  const pgMajor=Number((await root.query("SELECT current_setting('server_version_num') AS v")).rows[0].v);
  assert.ok(pgMajor>=160000&&pgMajor<170000,'PG16 only');
  for(const k of keys)await root.query('CREATE ROLE '+role[k]+
   (pass[k]?" LOGIN PASSWORD '"+pass[k]+"'":' NOLOGIN')+
   ' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION');
  await root.query('GRANT '+role.broker+' TO '+role.owner+' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  await root.query('GRANT '+role.executor+' TO '+role.rights+' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');
  await root.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+role.owner);
  await root.query('REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC');
  await root.query('CREATE TABLE '+lease+' (slot integer PRIMARY KEY,pid integer NOT NULL,'+
   ' started timestamptz NOT NULL,tenant text NOT NULL,actor text NOT NULL,'+
   ' nonce text NOT NULL,epoch integer NOT NULL)');
  await root.query('ALTER TABLE '+lease+' OWNER TO '+role.owner);
  await root.query('REVOKE ALL ON TABLE '+lease+' FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+schema+' TO '+[role.rights,role.a,role.b,role.c].join(','));
  await root.query('GRANT SELECT,INSERT,UPDATE ON '+lease+' TO '+role.rights);
  const matching='SELECT 1 FROM '+lease+' l JOIN pg_catalog.pg_stat_activity act '+
   "ON act.pid=l.pid AND pg_catalog.date_trunc('milliseconds',act.backend_start)=l.started "+
   'WHERE l.slot=1 AND l.pid=$1 AND l.started=$2 AND l.tenant=$3 '+
   'AND l.actor=session_user AND l.nonce=$4 AND l.epoch=$5';
  const body='DECLARE valid boolean; BEGIN '+
   'SELECT EXISTS ('+matching+') INTO valid; IF NOT valid THEN RETURN false; END IF; '+
   'PERFORM pg_catalog.pg_advisory_xact_lock($6); '+
   'SELECT EXISTS ('+matching+') INTO valid; IF NOT valid THEN RETURN false; END IF; '+
   'PERFORM pg_catalog.pg_advisory_xact_lock($7); '+
   'RETURN pg_catalog.pg_cancel_backend($1); END';
  await root.query('CREATE FUNCTION '+sig+' RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER '+
   'SET search_path=pg_catalog,pg_temp AS $fn$ '+body+' $fn$');
  await root.query('ALTER FUNCTION '+sig+' OWNER TO '+role.owner);
  await root.query('REVOKE ALL ON FUNCTION '+sig+' FROM PUBLIC');
  await root.query('GRANT EXECUTE ON FUNCTION '+sig+' TO '+[role.a,role.b,role.c].join(','));
  async function connected(k){
   const c=new pg.Client({connectionString:login(k)});await c.connect();sessions.push(c);
   const privileges=(await c.query("SELECT rolsuper,rolcreaterole,"+
    "pg_has_role(session_user,'pg_signal_backend','member') AS broad "+
    'FROM pg_roles WHERE rolname=session_user')).rows[0];
   assert.deepEqual(privileges,{rolsuper:false,rolcreaterole:false,broad:false});return c;
  }
  const rights=await connected('rights'),ga=await connected('a'),
   gb=await connected('b'),gc=await connected('c');
  await rights.query('GRANT '+role.executor+' TO '+role.broker+
   ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');
  pool=new pg.Pool({connectionString:login('broker'),max:1,idleTimeoutMillis:30000});
  clientA=await pool.connect();
  const pid=(await clientA.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const backendStart=await started(root,pid);
  await rights.query('INSERT INTO '+lease+
   ' (slot,pid,started,tenant,actor,nonce,epoch) VALUES (1,$1,$2,$3,$4,$5,1)',
   [pid,new Date(backendStart),'tenant-A',role.a,nonce.a]);
  const gaPid=(await ga.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  await rights.query('SELECT pg_advisory_lock($1::bigint)',[p1]);
  const oldA=settle(ga.query(call,[pid,new Date(backendStart),'tenant-A',nonce.a,1,p1,p2]));
  await waiting(root,gaPid,p1); // First lease validation was true.
  clientA.release();clientA=null;
  const B=await pool.connect();
  try{
   assert.equal((await B.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,pid);
   assert.equal(await started(root,pid),backendStart);
   await rights.query('BEGIN');
   try{await rights.query('REVOKE '+role.executor+' FROM '+role.broker);
    await rights.query('COMMIT')}catch(e){await rights.query('ROLLBACK').catch(()=>{});throw e}
   assert.equal((await root.query('SELECT pg_has_role($1,$2,$3) AS x',
    [role.broker,role.executor,'SET'])).rows[0].x,false);
   await rights.query('UPDATE '+lease+' SET tenant=$1,actor=$2,nonce=$3,epoch=2 WHERE slot=1',
    ['tenant-B',role.b,nonce.b]);
   const bSQL=settle(B.query('SELECT pg_sleep(2.5),150 AS marker'));
   await active(root,pid,'pg_sleep(2.5)');
   assert.equal((await rights.query('SELECT pg_advisory_unlock($1::bigint) AS x',[p1])).rows[0].x,true);
   const rejected=await oldA;
   assert.equal(rejected.code,undefined);
   assert.equal(rejected.value.rows[0].ok,false);
   const bDone=await bSQL;
   assert.equal(bDone.code,undefined);
   assert.equal(bDone.value.rows[0].marker,150);
   await denied(ga.query('SELECT pg_cancel_backend($1)',[pid]));
   await denied(gc.query('SELECT pg_cancel_backend($1)',[pid]));
   assert.equal((await ga.query(call,
    [pid,new Date(backendStart),'tenant-B',nonce.b,2,p1,p2])).rows[0].ok,false);
   assert.equal((await gb.query(call,
    [pid,new Date(backendStart),'tenant-B',nonce.a,2,p1,p2])).rows[0].ok,false);
  }finally{B.release()}
  // Pass BOTH validations of B; hold the second lock immediately before physical signalling.
  await rights.query('SELECT pg_advisory_lock($1::bigint)',[p3]);
  await rights.query('SELECT pg_advisory_lock($1::bigint)',[p4]);
  const gbPid=(await gb.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const staleB=settle(gb.query(call,[pid,new Date(backendStart),'tenant-B',nonce.b,2,p3,p4]));
  await waiting(root,gbPid,p3);
  assert.equal((await rights.query('SELECT pg_advisory_unlock($1::bigint) AS x',[p3])).rows[0].x,true);
  await waiting(root,gbPid,p4); // Second lease validation has passed.
  const C=await pool.connect();
  try{
   assert.equal((await C.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,pid);
   assert.equal(await started(root,pid),backendStart);
   await rights.query('UPDATE '+lease+' SET tenant=$1,actor=$2,nonce=$3,epoch=3 WHERE slot=1',
    ['tenant-C',role.c,nonce.c]);
   const cSQL=settle(C.query('SELECT pg_sleep(8.0),1503 AS marker'));
   await active(root,pid,'pg_sleep(8.0)');
   await denied(ga.query('SELECT pg_cancel_backend($1)',[pid]));
   await denied(gc.query('SELECT pg_cancel_backend($1)',[pid]));
   assert.equal((await rights.query('SELECT pg_advisory_unlock($1::bigint) AS x',[p4])).rows[0].x,true);
   const bCancel=await staleB;
   assert.equal(bCancel.code,undefined);
   assert.equal(bCancel.value.rows[0].ok,true);
   assert.equal((await cSQL).code,'57014');
   assert.equal((await C.query('SELECT current_user AS u')).rows[0].u,role.broker);
   assert.equal((await gb.query(call,
    [pid,new Date(backendStart),'tenant-B',nonce.b,2,p3,p4])).rows[0].ok,false);
  }finally{C.release()}
  console.log(JSON.stringify({
   suite:'TUR150_REAL_PG16_TWO_CHECK_CANCEL_TOCTOU',postgresMajor:16,
   independentRestrictedIAM:true,rightsAdminRevokeCommit:true,pgPoolMax:1,
   samePidBackendStartAtoBtoC:true,firstCheckInvalidationDenied:true,
   secondCheckToCancelWindowObserved:true,wrongTenantCQueryCancelled:'57014',
   guardianDirectCancelDenied:'42501',testOnlySecurityDefiner:true,
   globalPgSignalBackendGranted:false,atomicSignalAuthorization:false,
   productionFix:'NOT_IMPLEMENTED',issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  if(clientA)clientA.release();
  for(const c of sessions)await c.end().catch(()=>{});
  if(pool)await pool.end().catch(()=>{});
  if(rootReady){
   await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   await root.query('DROP OWNED BY '+keys.map(k=>role[k]).join(',')+' CASCADE').catch(()=>{});
   for(const k of [...keys].reverse())await root.query('DROP ROLE IF EXISTS '+role[k]).catch(()=>{});
  }
  await root.end().catch(()=>{});
 }
});