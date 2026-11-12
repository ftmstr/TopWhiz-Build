import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// TUR129: disposable real PG16; NOT production authorization or an IAM fix.
// Unlike TUR125 sticky SET ROLE, A uses SET LOCAL ROLE in a live transaction.
// Revocation cannot interrupt active SET LOCAL; COMMIT must clear it before B.
// No production SQL IAM/role change, test-only SECURITY DEFINER function.
const raw = process.env.TEST_DATABASE_URL || '';
const url = (() => { try { return new URL(raw); } catch { return null; } })();
if (process.env.CI !== 'true' || process.env.TUR129_DISPOSABLE_PG16 !== '1' ||
    !url || url.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '5432' || url.pathname !== '/topwhiz_test' ||
    decodeURIComponent(url.username) !== 'topwhiz_test' || url.search || url.hash)
  throw Error('TUR129 requires explicitly authorized disposable localhost PG16');

const suffix = randomBytes(5).toString('hex');
const labels = ['victim', 'definer', 'executor', 'broker', 'admin', 'spectator'];
const names = labels.map(x => 'tw129_' + x + '_' + suffix);
const passwords = names.map(() => randomBytes(20).toString('hex'));
const schema = 'tw129_gate_' + suffix;
const functionSig = schema + '.cancel_foreign(integer)';
const call = 'SELECT ' + schema + '.cancel_foreign($1) AS cancelled';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitActive(root, pid, marker) {
  for (let i = 0; i < 180; i++) {
    const row = (await root.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
    if (row?.state === 'active' && row.query.includes(marker)) return;
    await sleep(25);
  }
  throw Error('Victim SQL not active: ' + marker);
}
async function runVictim(victim, root, pid, marker, seconds) {
  const query = 'SELECT pg_sleep(' + seconds + '),' + marker + ' AS marker';
  const completion = victim.query(query).then(r => ({ marker: r.rows[0].marker }), e => ({ error: e }));
  await waitActive(root, pid, 'pg_sleep(' + seconds + ')');
  return { completion };
}
async function denied(promise) {
  await assert.rejects(promise, e => e?.code === '42501');
}

test('real PG16 SET LOCAL ROLE persists only until A COMMIT while independent REVOKE happens during transaction', { timeout: 120000 }, async () => {
  const root = new pg.Client({ connectionString: raw });
  const sessions = [];
  let pool, victimPool, connected = false;
  const loginUrl = i => {
    const u = new URL(raw);
    u.username = names[i]; u.password = passwords[i];
    return u.href;
  };
  async function login(i) {
    const client = new pg.Client({ connectionString: loginUrl(i) });
    await client.connect(); sessions.push(client);
    const info = (await client.query(
      "SELECT session_user AS s,rolsuper,rolcreaterole,pg_has_role(session_user,'pg_signal_backend','member') AS broad FROM pg_roles WHERE rolname=session_user"
    )).rows[0];
    assert.deepEqual(info, { s: names[i], rolsuper: false, rolcreaterole: false, broad: false });
    return client;
  }
  try {
    await root.connect(); connected = true;
    const major = Number((await root.query("SELECT current_setting('server_version_num') AS n")).rows[0].n);
    assert.ok(major >= 160000 && major < 170000);
    for (let i = 0; i < names.length; i++) {
      const isLogin = [0, 3, 4, 5].includes(i);
      await root.query('CREATE ROLE ' + names[i] +
        (isLogin ? " LOGIN PASSWORD '" + passwords[i] + "'" : ' NOLOGIN') +
        ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION');
    }
    await root.query('GRANT ' + names[0] + ' TO ' + names[1] +
      ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
    await root.query('CREATE SCHEMA ' + schema + ' AUTHORIZATION ' + names[1]);
    await root.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    await root.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' + names[2] + ',' + names[3]);
    await root.query('CREATE FUNCTION ' + schema +
      '.cancel_foreign(in_pid integer) RETURNS boolean LANGUAGE plpgsql ' +
      'SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$ ' +
      'BEGIN RETURN pg_catalog.pg_cancel_backend(in_pid); END; $f$');
    await root.query('ALTER FUNCTION ' + functionSig + ' OWNER TO ' + names[1]);
    await root.query('REVOKE ALL ON FUNCTION ' + functionSig + ' FROM PUBLIC');
    await root.query('GRANT EXECUTE ON FUNCTION ' + functionSig + ' TO ' + names[2]);
    await root.query('GRANT ' + names[2] + ' TO ' + names[4] +
      ' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');

    const admin = await login(4), spectator = await login(5);
    await denied(spectator.query('GRANT ' + names[2] + ' TO ' + names[3]));
    await admin.query('GRANT ' + names[2] + ' TO ' + names[3] +
      ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');

    pool = new pg.Pool({ connectionString: loginUrl(3), max: 1, idleTimeoutMillis: 30000 });
    victimPool = new pg.Pool({ connectionString: loginUrl(0), max: 1, idleTimeoutMillis: 30000 });
    const victim = await victimPool.connect();
    try {
      const victimPid = (await victim.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const A = await pool.connect();
      let brokerPid, backendStart, txOpen = false;
      try {
        brokerPid = (await A.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        backendStart = (await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [brokerPid])).rows[0].backend_start;
        assert.equal((await A.query('SELECT current_user AS u')).rows[0].u, names[3]);
        await denied(A.query(call, [victimPid]));
        await denied(A.query('SELECT pg_cancel_backend($1)', [victimPid]));
        await A.query('BEGIN'); txOpen = true;
        await A.query('SET LOCAL ROLE ' + names[2]);
        const localIdentity = (await A.query('SELECT session_user AS s,current_user AS u')).rows[0];
        assert.deepEqual(localIdentity, { s: names[3], u: names[2] });

        // Independently authenticated non-superuser role administrator
        // COMMITs REVOKE while A's transaction-local executor is active.
        await admin.query('BEGIN');
        try {
          await admin.query('REVOKE ' + names[2] + ' FROM ' + names[3]);
          await admin.query('COMMIT');
        } catch (e) {
          await admin.query('ROLLBACK').catch(() => {});
          throw e;
        }
        assert.equal((await root.query('SELECT pg_has_role($1,$2,$3) AS ok',
          [names[3], names[2], 'SET'])).rows[0].ok, false);
        assert.equal((await A.query('SELECT current_user AS u')).rows[0].u, names[2],
          'committed admin REVOKE does not interrupt an active local executor');

        // A different LOGIN's real SQL remains cancellable until A ends
        // its transaction. Promise wrapper prevents awaiting it prematurely.
        const { completion: activeSql } = await runVictim(victim, root, victimPid, 1291, 5);
        assert.equal((await A.query(call, [victimPid])).rows[0].cancelled, true);
        assert.equal((await activeSql).error?.code, '57014');

        await A.query('COMMIT'); txOpen = false;
        const afterCommit = (await A.query('SELECT session_user AS s,current_user AS u')).rows[0];
        assert.deepEqual(afterCommit, { s: names[3], u: names[3] },
          'SET LOCAL ROLE must auto-reset after transaction COMMIT');
        await denied(A.query('SET ROLE ' + names[2]));
        await denied(A.query(call, [victimPid]));
      } finally {
        if (txOpen) await A.query('ROLLBACK').catch(() => {});
        A.release();
      }

      // In contrast to TUR128's forced backend destruction, the normal
      // physical PG16 session may be safely reused after SET LOCAL COMMIT.
      const B = await pool.connect();
      try {
        const identity = (await B.query('SELECT pg_backend_pid() AS pid,session_user AS s,current_user AS u')).rows[0];
        assert.equal(identity.pid, brokerPid);
        assert.equal(identity.s, names[3]);
        assert.equal(identity.u, names[3]);
        const currentStart = (await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',
          [identity.pid])).rows[0].backend_start;
        assert.equal(new Date(currentStart).getTime(), new Date(backendStart).getTime());
        assert.equal(pool.totalCount, 1);
        await denied(B.query(call, [victimPid]));
        await denied(B.query('SET ROLE ' + names[2]));
        const { completion: safeSql } = await runVictim(victim, root, victimPid, 1292, 1.1);
        await denied(B.query(call, [victimPid]));
        assert.deepEqual(await safeSql, { marker: 1292 });
      } finally { B.release(); }

      const C = await pool.connect();
      try {
        assert.equal((await C.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, brokerPid);
        assert.equal((await C.query('SELECT current_user AS u')).rows[0].u, names[3]);
      } finally { C.release(); }
      console.log(JSON.stringify({
        suite: 'TUR129_REAL_PG16_SET_LOCAL_ROLE_ACTIVE_REVOKE_COMMIT_POOL_CLEAN',
        actualPgMajor: 16, separateRestrictedLogins: 4,
        physicalPoolMaxOneAtoBtoC: true, samePidAndBackendStart: true,
        independentRightsAdminRevokeCommitDuringTransaction: true,
        membershipSetRemoved: true,
        activeLocalExecutorSurvivedRevoke: true,
        victimCancelledWhileLocalRoleActiveSqlstate: '57014',
        transactionCommitAutoRestoredBrokerIdentity: true,
        afterCommitDeniedFunctionAndSetRole: '42501',
        normalPoolReleaseWithoutDestroy: true, requestBSafeSqlMarker: 1292,
        requestCRemainedBroker: true, globalPgSignalBackendGranted: false,
        productionRemediation: 'NOT_IMPLEMENTED', remoteR2CdnLastByte: 'NOT_PROVEN',
        productionNextWorkerRequestSignal: 'NOT_PROVEN',
        osPidRecycling: 'NOT_TESTED',
        issue22: 'OPEN', release: 'NO_GO'
      }));
    } finally { victim.release(); }
  } finally {
    if (pool) await pool.end().catch(() => {});
    if (victimPool) await victimPool.end().catch(() => {});
    for (const s of sessions) await s.end().catch(() => {});
    if (connected) {
      await root.query('DROP OWNED BY ' + names.join(',') + ' CASCADE').catch(() => {});
      await root.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
      for (const name of [...names].reverse()) await root.query('DROP ROLE IF EXISTS ' + name).catch(() => {});
    }
    await root.end().catch(() => {});
  }
});
