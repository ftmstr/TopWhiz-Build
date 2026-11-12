import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

/**
 * TUR107: a SECURITY DEFINER PostgreSQL16 cancellation wrapper that validates
 * pid/backend_start/epoch/request is still NOT request-bound authorization.
 * A permitted broker who learns another request's CURRENT tuple can invoke it.
 * This is a controlled negative, not a production security implementation.
 */
const db=(()=>{try{return new URL(process.env.TEST_DATABASE_URL||'')}catch{return null}})();
if(process.env.CI!=='true'||process.env.TUR107_DISPOSABLE_PG16!=='1'||
 !db||db.protocol!=='postgresql:'||
 !['localhost','127.0.0.1'].includes(db.hostname)||
 (db.port&&db.port!=='5432')||db.pathname!=='/topwhiz_test'||
 decodeURIComponent(db.username)!=='topwhiz_test'||db.search||db.hash)
 throw Error('TUR107 requires explicit disposable localhost PostgreSQL16');
const hex=randomBytes(5).toString('hex');
const roles=['victim','gate','broker','outsider','guardian_read','guardian_owner']
 .map(n=>'tw107_'+n+'_'+hex);
const passwords=roles.map(()=>randomBytes(20).toString('hex'));
const gated='tw107_cancel_'+hex,guardian='tw107_guard_'+hex;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function activeSql(root,pid,fragment){
 for(let i=0;i<160;i++){
  const state=(await root.query(
   'SELECT state,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(state?.state==='active'&&state.query.includes(fragment))return;
  await delay(20);
 }
 throw Error('SQL never active on PG16 backend '+pid+' '+fragment);
}
async function ongoing(client,root,pid,marker,seconds){
 // Never return the query promise directly from an async helper:
 // Promise adoption would wait for SQL completion BEFORE cancellation.
 const query=client.query('SELECT pg_sleep('+seconds+'),'+marker+' AS marker')
  .then(r=>({marker:r.rows[0].marker}),error=>({error}));
 await activeSql(root,pid,'pg_sleep('+seconds+')');
 return {promise:query};
}
async function rejectSQL(promise,code){
 await assert.rejects(promise,error=>error?.code===code);
}
test('PG16 SECDEF scoped cancel RPC rejects stale lease but accepts current tuple replay by wrong request',{timeout:120000},async()=>{
 const root=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
 let connected=false,pool;
 const clients=[];
 try{
  await root.connect();connected=true;
  const version=Number((await root.query("SELECT current_setting('server_version_num') num")).rows[0].num);
  assert.ok(version>=160000&&version<170000);
  for(let i=0;i<roles.length;i++)
   await root.query('CREATE ROLE '+roles[i]+' '+
    (i===1?'NOLOGIN':'LOGIN')+
    ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'+
    (i===1?'':" PASSWORD '"+passwords[i]+"'"));
  // The gate's effective privileges may cancel victim's backend; the broker
  // receives only EXECUTE, never membership or global pg_signal_backend.
  await root.query('GRANT '+roles[0]+' TO '+roles[1]+
   ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  await root.query('CREATE SCHEMA '+gated+' AUTHORIZATION '+roles[1]);
  await root.query('CREATE TABLE '+gated+
   '.lease(slot integer PRIMARY KEY CHECK(slot=1),pid integer NOT NULL,'+
   'backend_start timestamptz NOT NULL,epoch bigint NOT NULL,request_key text NOT NULL)');
  await root.query('ALTER TABLE '+gated+'.lease OWNER TO '+roles[1]);
  await root.query('REVOKE ALL ON SCHEMA '+gated+' FROM PUBLIC');
  await root.query('REVOKE ALL ON '+gated+'.lease FROM PUBLIC');
  const proc=gated+'.cancel_if_current(integer,timestamptz,bigint,text)';
  const sql=
   'CREATE FUNCTION '+gated+
   '.cancel_if_current(in_pid integer,in_start timestamptz,in_epoch bigint,in_request text) '+
   'RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER '+
   'SET search_path = pg_catalog, pg_temp AS $body$ '+
   'DECLARE pinned RECORD; real_start timestamptz; real_user name; '+
   'BEGIN '+
   'SELECT t.pid,t.backend_start,t.epoch,t.request_key INTO pinned '+
   'FROM '+gated+'.lease AS t WHERE t.slot=1; '+
   'IF NOT FOUND THEN RETURN FALSE; END IF; '+
   'IF pinned.pid IS DISTINCT FROM in_pid OR '+
   'pinned.backend_start IS DISTINCT FROM in_start OR '+
   'pinned.epoch IS DISTINCT FROM in_epoch OR '+
   'pinned.request_key IS DISTINCT FROM in_request THEN RETURN FALSE; END IF; '+
   'SELECT a.backend_start,a.usename INTO real_start,real_user '+
   'FROM pg_catalog.pg_stat_activity AS a WHERE a.pid=in_pid; '+
   'IF real_start IS DISTINCT FROM in_start OR '+
   "real_user IS DISTINCT FROM '"+roles[0]+"'::name THEN RETURN FALSE; END IF; "+
   'RETURN pg_catalog.pg_cancel_backend(in_pid); '+
   'END; $body$';
  await root.query(sql);
  await root.query('ALTER FUNCTION '+proc+' OWNER TO '+roles[1]);
  await root.query('REVOKE ALL ON FUNCTION '+proc+' FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+gated+' TO '+roles[2]);
  await root.query('GRANT EXECUTE ON FUNCTION '+proc+' TO '+roles[2]);
  await root.query('CREATE SCHEMA '+guardian+' AUTHORIZATION '+roles[5]);
  await root.query('CREATE TABLE '+guardian+
   '.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
  await root.query('ALTER TABLE '+guardian+'.anchor OWNER TO '+roles[5]);
  await root.query('REVOKE ALL ON SCHEMA '+guardian+' FROM PUBLIC');
  await root.query('REVOKE ALL ON '+guardian+'.anchor FROM PUBLIC');
  await root.query('GRANT USAGE ON SCHEMA '+guardian+' TO '+roles[4]);
  await root.query('GRANT SELECT ON '+guardian+'.anchor TO '+roles[4]);
  await root.query("INSERT INTO "+guardian+".anchor VALUES('fictional',true,1)");
  const urlFor=i=>{const v=new URL(process.env.TEST_DATABASE_URL);v.username=roles[i];v.password=passwords[i];return v.href};
  pool=new pg.Pool({connectionString:urlFor(0),max:1,idleTimeoutMillis:30000});
  async function login(i){
   const c=new pg.Client({connectionString:urlFor(i)});await c.connect();clients.push(c);
   const row=(await c.query("SELECT session_user,rolsuper,rolcreaterole,"+
    "pg_has_role(session_user,'pg_signal_backend','member') sig FROM pg_roles WHERE rolname=session_user")).rows[0];
   assert.equal(row.session_user,roles[i]);
   assert.equal(row.rolsuper,false);assert.equal(row.rolcreaterole,false);assert.equal(row.sig,false);
   return c;
  }
  const broker=await login(2),attacker=await login(3),
   guardianReader=await login(4),guardianOwner=await login(5);
  const pgRole=(await root.query("SELECT rolcanlogin,rolsuper FROM pg_roles WHERE rolname=$1",[roles[1]])).rows[0];
  assert.equal(pgRole.rolcanlogin,false);assert.equal(pgRole.rolsuper,false);
  assert.equal((await root.query(
   'SELECT proconfig,prosecdef FROM pg_proc WHERE oid=$1::regprocedure',
   [proc])).rows[0].prosecdef,true);
  // A returned its real checkout; B will reuse SAME physical SQL backend.
  const A=await pool.connect();
  let pid,backendStart;
  try{
   pid=(await A.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   backendStart=(await root.query(
    'SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].backend_start;
   await root.query('INSERT INTO '+gated+
    '.lease(slot,pid,backend_start,epoch,request_key) VALUES(1,$1,$2,1,$3)',
    [pid,backendStart,'A']);
   assert.equal((await A.query('SELECT 107 AS marker')).rows[0].marker,107);
  }finally{A.release()}
  const B=await pool.connect();
  try{
   const newPid=(await B.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const startB=(await root.query(
    'SELECT backend_start FROM pg_stat_activity WHERE pid=$1',[newPid])).rows[0].backend_start;
   assert.equal(newPid,pid);
   assert.equal(new Date(startB).getTime(),new Date(backendStart).getTime());
   await root.query('UPDATE '+gated+'.lease SET epoch=2,request_key=$1 WHERE slot=1',['B']);
   const call='SELECT '+gated+'.cancel_if_current($1,$2,$3,$4) cancelled';
   const prior=[pid,backendStart,'1','A'];
   const current=[pid,backendStart,'2','B'];
   await rejectSQL(broker.query('SELECT pg_cancel_backend($1)',[pid]),'42501');
   await rejectSQL(attacker.query(call,current),'42501');
   await rejectSQL(guardianReader.query(call,current),'42501');
   const granted=(await root.query(
     'SELECT has_function_privilege($1,$2,$3) permitted',
     [roles[2],proc,'EXECUTE'])).rows[0].permitted;
   assert.equal(granted,true);
   const stale=(await broker.query(call,prior)).rows[0].cancelled;
   assert.equal(stale,false,'old A epoch ticket rejected by SECDEF');
   const wrongBackendStart=[pid,new Date(new Date(backendStart).getTime()-1000),'2','B'];
   assert.equal((await broker.query(call,wrongBackendStart)).rows[0].cancelled,false);
   // A request-unauthorized broker already holding EXECUTE can simply present
   // B's fresh tuple and cancel B. This is the new unsafe counterexample.
   const live=(await ongoing(B,root,pid,1072,6)).promise;
   const improper=(await broker.query(call,current)).rows[0].cancelled;
   assert.equal(improper,true,'broker can spoof another request fresh lease tuple');
   assert.equal((await live).error?.code,'57014');
   assert.equal((await B.query('SELECT 107 AS recovered')).rows[0].recovered,107);
   await root.query('REVOKE EXECUTE ON FUNCTION '+proc+' FROM '+roles[2]);
   await rejectSQL(broker.query(call,current),'42501');
   const after=(await ongoing(B,root,pid,1073,1.2)).promise;
   await rejectSQL(broker.query(call,current),'42501');
   assert.deepEqual(await after,{marker:1073});
  }finally{B.release()}
  await rejectSQL(broker.query(
   'UPDATE '+guardian+".anchor SET approved=true WHERE id='fictional'"),'42501');
  await guardianOwner.query('BEGIN');
  try{
   const changed=await guardianOwner.query('UPDATE '+guardian+
    ".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
   assert.equal(changed.rowCount,1);await guardianOwner.query('COMMIT');
  }catch(error){await guardianOwner.query('ROLLBACK').catch(()=>{});throw error}
  const anchor=(await guardianReader.query(
   'SELECT approved,generation FROM '+guardian+".anchor WHERE id='fictional'")).rows[0];
  assert.deepEqual(anchor,{approved:false,generation:'2'});
  console.log(JSON.stringify({
   suite:'TUR107_PG16_SECDEF_REQUEST_LEASE_SPOOF_CANCEL_NEGATIVE',
   postgresMajor:16,pgPoolMax1:true,samePidAndBackendStartAfterCheckout:true,
   testOnlyEpochStaleTicketDenied:true,spoofedBackendStartDenied:true,
   brokerDirectCancelDenied42501:true,outsiderFunctionCallDenied42501:true,
   secdefSearchPathRestricted:true,secdefOwnerNoLogin:true,
   brokerCanSpoofFreshOtherRequestLease:true,otherRequestCancelled57014:true,
   revocationOfFunctionExecuteRestores42501:true,unaffectedBQueryMarker:1073,
   independentGuardianGeneration:'2',noGlobalPgSignalBackend:true,
   productionCallerProof:'NOT_IMPLEMENTED',productionIAM:'NOT_IMPLEMENTED',
   osPidRecycling:'NOT_TESTED',productionNextWorkerSignal:'NOT_PROVEN',
   receiverCDNLastByte:'NOT_PROVEN',issue22:'OPEN',release:'NO_GO'
  }));
 }finally{
  if(pool)await pool.end().catch(()=>{});
  for(const c of clients)await c.end().catch(()=>{});
  if(connected){
   await root.query('DROP SCHEMA IF EXISTS '+gated+' CASCADE').catch(()=>{});
   await root.query('DROP SCHEMA IF EXISTS '+guardian+' CASCADE').catch(()=>{});
   for(const role of [...roles].reverse())await root.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
  }
  await root.end().catch(()=>{});
 }
});