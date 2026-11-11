import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

/**
 * TUR092 — a real disposable PG16 connection-pool *handoff* counterexample.
 * A completed request A returns an open backend to a simulated pool. After
 * DISCARD ALL, request B checks out that exact backend PID and runs SQL.
 * A stale A ticket is rejected by a test-only application lease check, but
 * a third session authenticated as the SAME non-superuser SQL role can issue
 * pg_cancel_backend(pid) directly and abort unrelated request B (57014).
 * This is NOT a production pool, OS PID recycling, or an IAM fix.
 */
const uri = (() => { try { return new URL(process.env.TEST_DATABASE_URL || ''); } catch { return null; } })();
if (process.env.CI !== 'true' || process.env.TUR092_DISPOSABLE_PG16 !== '1' ||
    !uri || uri.protocol !== 'postgresql:' ||
    !['localhost','127.0.0.1'].includes(uri.hostname) ||
    (uri.port && uri.port !== '5432') ||
    uri.pathname !== '/topwhiz_test' || decodeURIComponent(uri.username) !== 'topwhiz_test' ||
    uri.search || uri.hash)
  throw Error('TUR092: explicit isolated disposable localhost PG16 fixture required');

const suffix=randomBytes(5).toString('hex');
const roles=['media_reader','media_owner','guardian_reader','guardian_owner'].map(n => 'tw092_'+n+'_'+suffix);
const passwords=roles.map(() => randomBytes(20).toString('hex'));
const mediaSchema='tw092_media_'+suffix, guardianSchema='tw092_guard_'+suffix;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function awaitRunning(admin,pid,sql){
  for(let i=0;i<100;i++){
    const row=(await admin.query('SELECT state, query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
    if(row?.state==='active' && row.query.includes(sql)) return;
    await sleep(20);
  }
  throw Error('real PG16 backend never reached active query: '+sql);
}
function permittedTicket(ticket,checkout){
  return ticket.pid===checkout.pid && ticket.epoch===checkout.epoch &&
    ticket.lease===checkout.lease && ticket.request===checkout.request &&
    checkout.live===true;
}

test('actual PG16 pool handoff: stale request PID cancels a different same-role request despite test-only lease rejection',{timeout:120000},async()=>{
  const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
  let connected=false;
  const sessions=[];
  try {
    await admin.connect();connected=true;
    const version=Number((await admin.query("SELECT current_setting('server_version_num') AS n")).rows[0].n);
    assert.ok(version>=160000&&version<170000,'must be actual PostgreSQL 16');
    for(let i=0;i<roles.length;i++)
      await admin.query('CREATE ROLE '+roles[i]+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+passwords[i]+"'");
    await admin.query('CREATE SCHEMA '+mediaSchema+' AUTHORIZATION '+roles[1]);
    await admin.query('CREATE TABLE '+mediaSchema+'.media(id text PRIMARY KEY,approved boolean NOT NULL)');
    await admin.query('ALTER TABLE '+mediaSchema+'.media OWNER TO '+roles[1]);
    await admin.query('REVOKE ALL ON SCHEMA '+mediaSchema+' FROM PUBLIC');
    await admin.query('GRANT USAGE ON SCHEMA '+mediaSchema+' TO '+roles[0]);
    await admin.query('GRANT SELECT ON '+mediaSchema+'.media TO '+roles[0]);
    await admin.query('CREATE SCHEMA '+guardianSchema+' AUTHORIZATION '+roles[3]);
    await admin.query('CREATE TABLE '+guardianSchema+'.anchor(id text PRIMARY KEY,approved boolean NOT NULL,generation bigint NOT NULL)');
    await admin.query('ALTER TABLE '+guardianSchema+'.anchor OWNER TO '+roles[3]);
    await admin.query('REVOKE ALL ON SCHEMA '+guardianSchema+' FROM PUBLIC');
    await admin.query('REVOKE ALL ON '+guardianSchema+'.anchor FROM PUBLIC');
    await admin.query('GRANT USAGE ON SCHEMA '+guardianSchema+' TO '+roles[2]);
    await admin.query('GRANT SELECT ON '+guardianSchema+'.anchor TO '+roles[2]);
    await admin.query("INSERT INTO "+mediaSchema+".media VALUES('fictional',true)");
    await admin.query("INSERT INTO "+guardianSchema+".anchor VALUES('fictional',true,1)");
    async function login(i){
      const u=new URL(process.env.TEST_DATABASE_URL);u.username=roles[i];u.password=passwords[i];
      const c=new pg.Client({connectionString:u.href});
      await c.connect();sessions.push(c);
      const v=(await c.query(
        "SELECT session_user, rolsuper, rolcreaterole, pg_has_role(session_user,'pg_signal_backend','member') AS signal_member FROM pg_roles WHERE rolname=session_user"
      )).rows[0];
      assert.equal(v.session_user,roles[i]);
      assert.equal(v.rolsuper,false);
      assert.equal(v.rolcreaterole,false);
      assert.equal(v.signal_member,false,'no global pg_signal_backend grant');
      return c;
    }
    // Pool slot is an ACTUAL long-lived PostgreSQL backend, not a mocked PID.
    const pooled=await login(0),sameRoleCanceller=await login(0),
      sibling=await login(0),mediaOwner=await login(1),
      guardianReader=await login(2),guardianOwner=await login(3);
    assert.equal((await pooled.query("SELECT id FROM "+mediaSchema+".media WHERE approved=true")).rows[0].id,'fictional');
    const pidA=(await pooled.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const oldTicket={pid:pidA,epoch:1,lease:'checkout-A',request:'request-A'};
    const aResult=await pooled.query('SELECT 91 AS completed');
    assert.equal(aResult.rows[0].completed,91,'request A has fully completed before checkout B');
    // Return this very same live connection to a simulated pool, clear session state.
    await pooled.query('DISCARD ALL');
    const pidB=(await pooled.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    assert.equal(pidB,pidA,'actual backend PID persists across pool checkout, not OS PID recycle');
    const current={pid:pidB,epoch:2,lease:'checkout-B',request:'request-B',live:true};
    assert.equal(permittedTicket(oldTicket,current),false,'stale ticket must be rejected by test-only lease policy');
    assert.equal(permittedTicket({...current},current),true,'fresh matching ticket is accepted only in the illustrative policy');
    const siblingPid=(await sibling.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    assert.notEqual(siblingPid,pidB);
    const requestB=pooled.query('SELECT pg_sleep(8),92 AS marker').then(
      row=>({marker:row.rows[0].marker}),error=>({error}));
    const siblingSQL=sibling.query('SELECT pg_sleep(1.25),93 AS marker').then(
      row=>({marker:row.rows[0].marker}),error=>({error}));
    await awaitRunning(admin,pidB,'pg_sleep(8)');
    await awaitRunning(admin,siblingPid,'pg_sleep(1.25)');
    await assert.rejects(mediaOwner.query('SELECT pg_cancel_backend($1)',[pidB]),
      e=>e?.code==='42501','independent media-owner cannot cancel reader role');
    await assert.rejects(guardianReader.query('SELECT pg_cancel_backend($1)',[pidB]),
      e=>e?.code==='42501','independent guardian-reader cannot cancel media role');
    // The attack bypasses the application ticket check entirely.
    const malicious=await sameRoleCanceller.query('SELECT pg_cancel_backend($1) AS cancelled',[oldTicket.pid]);
    assert.equal(malicious.rows[0].cancelled,true);
    const b=await requestB;
    assert.equal(b.error?.code,'57014','different request B SQL is actually cancelled after A pool handoff');
    const unaffected=await siblingSQL;
    assert.deepEqual(unaffected,{marker:93});
    assert.equal((await pooled.query('SELECT 92 AS recovered')).rows[0].recovered,92,
      'pooled connection remains usable and can be handed out again');
    await assert.rejects(sameRoleCanceller.query(
      'UPDATE '+guardianSchema+".anchor SET approved=true WHERE id='fictional'"),
      e=>e?.code==='42501');
    const trueOwner=(await admin.query(
      'SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid=$1::regclass',
      [guardianSchema+'.anchor'])).rows[0].owner;
    assert.equal(trueOwner,roles[3]);
    await guardianOwner.query('BEGIN');
    try {
      const row=await guardianOwner.query('UPDATE '+guardianSchema+
        ".anchor SET approved=false,generation=2 WHERE id='fictional' AND approved=true AND generation=1");
      assert.equal(row.rowCount,1);
      await guardianOwner.query('COMMIT');
    } catch(e) { await guardianOwner.query('ROLLBACK').catch(()=>{});throw e; }
    const anchor=(await guardianReader.query('SELECT approved,generation FROM '+
      guardianSchema+".anchor WHERE id='fictional'")).rows[0];
    assert.deepEqual(anchor,{approved:false,generation:'2'});
    console.log(JSON.stringify({
      suite:'TUR092_REAL_PG16_POOL_HANDOFF_STALE_CANCEL_NEGATIVE',
      postgresMajor:16,independentNonSuperuserRoles:4,authenticatedRestrictedSessions:6,
      globalPgSignalBackendGranted:false,requestACompletedBeforeB:true,
      physicalBackendPidPersistsAcrossDiscardAll:true,osPidReuse:'NOT_TESTED',
      appLeaseRejectedStaleTicket:true,sqlCancelPrivilegeEnforcesLease:false,
      sameRoleAttackerUsedRequestAPidToCancelRequestB:true,requestBCancelSqlstate:b.error.code,
      siblingMarker:unaffected.marker,pooledConnectionRecovered:true,
      mediaOwnerCrossRoleCancelDenied:true,guardianReaderCrossRoleCancelDenied:true,
      independentGuardianOwnerCommitGeneration:anchor.generation,
      applicationGateEnforcedInPostgres:false,remoteIAM:'NOT_PROVEN',
      cloudflareRequestSignal:'NOT_PROVEN',cdnReceiverFinalByte:'NOT_PROVEN',
      originalImmutableOutboxSha:'INHERITED_CI',queueDlqCommit:'INHERITED_CI',
      issue22:'OPEN',release:'NO_GO'
    }));
  } finally {
    for(const c of sessions)await c.end().catch(()=>{});
    if(connected){
      await admin.query('DROP SCHEMA IF EXISTS '+mediaSchema+' CASCADE').catch(()=>{});
      await admin.query('DROP SCHEMA IF EXISTS '+guardianSchema+' CASCADE').catch(()=>{});
      for(const role of [...roles].reverse())await admin.query('DROP ROLE IF EXISTS '+role).catch(()=>{});
    }
    await admin.end().catch(()=>{});
  }
});
