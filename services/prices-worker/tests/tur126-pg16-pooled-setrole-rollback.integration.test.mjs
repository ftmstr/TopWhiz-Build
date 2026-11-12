import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// TUR126: disposable real PG16; NOT production authorization or an IAM fix.
// Unlike TUR124's single broker Client, a pooled broker session changes owner
// from request A to B while an already-active SET ROLE survives REVOKE COMMIT.
const raw = process.env.TEST_DATABASE_URL || '';
const url = (() => { try { return new URL(raw); } catch { return null; } })();
if (process.env.CI !== 'true' || process.env.TUR126_DISPOSABLE_PG16 !== '1' ||
    !url || url.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '5432' || url.pathname !== '/topwhiz_test' ||
    decodeURIComponent(url.username) !== 'topwhiz_test' || url.search || url.hash)
  throw Error('TUR126 requires explicitly authorized disposable localhost PG16');

const suffix = randomBytes(5).toString('hex');
const labels = ['victim', 'definer', 'executor', 'broker', 'admin', 'spectator'];
const names = labels.map(x => 'tw126_' + x + '_' + suffix);
const passwords = names.map(() => randomBytes(20).toString('hex'));
const schema = 'tw126_gate_' + suffix;
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

test('transaction ROLLBACK restores pooled executor after RESET ROLE despite independent rights-admin REVOKE COMMIT', { timeout: 120000 }, async () => {
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
      let brokerPid, backendStart;
      try {
        brokerPid = (await A.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        backendStart = (await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [brokerPid])).rows[0].backend_start;
        assert.equal((await A.query('SELECT current_user AS u')).rows[0].u, names[3]);
        await A.query('SET ROLE ' + names[2]);
        assert.equal((await A.query('SELECT current_user AS u')).rows[0].u, names[2]);
      } finally { A.release(); }

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

      // A's physical connection is returned to pg.Pool, then checked out by B.
      // The committed REVOKE cannot retroactively reset the session's current_user.
      const B = await pool.connect();
      try {
        const identity = (await B.query('SELECT pg_backend_pid() AS pid,session_user AS s,current_user AS u')).rows[0];
        assert.equal(identity.pid, brokerPid);
        assert.equal(identity.s, names[3]);
        assert.equal(identity.u, names[2]);
        const afterStart = (await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [identity.pid])).rows[0].backend_start;
        assert.equal(new Date(afterStart).getTime(), new Date(backendStart).getTime());
        assert.equal(pool.totalCount, 1);
        const { completion: cancelled } = await runVictim(victim, root, victimPid, 1261, 5);
        assert.equal((await B.query(call, [victimPid])).rows[0].cancelled, true);
        assert.equal((await cancelled).error?.code, '57014',
          'request B inherits A effective SQL identity and cancels an unrelated victim');

        // NEW TUR126 ADVERSARIAL CORE: retry/cleanup attempts RESET ROLE
        // inside a transaction, but a subsequent ROLLBACK restores the
        // already-elevated executor role. The independent rights-admin
        // committed REVOKE before request B even checked out the pool.
        await B.query('BEGIN');
        try {
          await B.query('RESET ROLE');
          const withinTx = (await B.query(
            'SELECT session_user AS s,current_user AS u'
          )).rows[0];
          assert.equal(withinTx.s, names[3], 'session_user remains broker');
          assert.equal(withinTx.u, names[3], 'RESET ROLE temporarily lowers the current_user');
          await denied(B.query(call, [victimPid]));
          // An expected SQLSTATE 42501 aborts the transaction, and the
          // ROLLBACK must also undo transactional RESET ROLE.
          await B.query('ROLLBACK');
        } catch (e) {
          await B.query('ROLLBACK').catch(() => {});
          throw e;
        }
        const resurrected = (await B.query(
          'SELECT session_user AS s,current_user AS u'
        )).rows[0];
        assert.equal(resurrected.s, names[3]);
        assert.equal(resurrected.u, names[2],
          'ROLLBACK restores executor SQL identity despite committed membership REVOKE');
        assert.equal((await root.query(
          'SELECT pg_has_role($1,$2,$3) AS allowed',
          [names[3], names[2], 'SET']
        )).rows[0].allowed, false,
          'independent administrator membership REVOKE remains committed');
        const { completion: rollbackCancel } =
          await runVictim(victim, root, victimPid, 1263, 5);
        assert.equal((await B.query(call, [victimPid])).rows[0].cancelled, true);
        assert.equal((await rollbackCancel).error?.code, '57014',
          'transaction rollback reactivates stale executor and cancels foreign request');

        // A stand-alone RESET ROLE OUTSIDE an aborted transaction is
        // required to cut off the stale privilege on this real pool client.
        await B.query('RESET ROLE');
        assert.equal((await B.query('SELECT current_user AS u')).rows[0].u, names[3]);
        await denied(B.query('SET ROLE ' + names[2]));
        await denied(B.query(call, [victimPid]));
      } finally { B.release(); }

      const C = await pool.connect();
      try {
        assert.equal((await C.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, brokerPid);
        assert.equal((await C.query('SELECT current_user AS u')).rows[0].u, names[3]);
        const { completion: safe } = await runVictim(victim, root, victimPid, 1262, 1.1);
        await denied(C.query(call, [victimPid]));
        assert.deepEqual(await safe, { marker: 1262 });
      } finally { C.release(); }
      console.log(JSON.stringify({
        suite: 'TUR126_REAL_PG16_TRANSACTION_RESET_ROLE_ROLLBACK_STALE_CANCEL',
        actualPgMajor: 16, separateRestrictedLogins: 4,
        physicalPoolMaxOneAtoBtoC: true, samePidAndBackendStart: true,
        independentRightsAdminRevokeCommit: true, membershipSetRemoved: true,
        crossRequestActiveRolePersists: true, postCommitForeignCancelSqlstate: '57014',
        transactionalResetTemporarilyDenied42501: true,
        transactionRollbackRestoredRevokedExecutor: true,
        foreignCancelAfterRollbackSqlstate: '57014',
        standaloneResetOutsideTransactionRestores42501: true,
        resetRoleBlocksFunctionAndSetRole: '42501', safeVictimMarker: 1262,
        globalPgSignalBackendGranted: false, productionRemediation: 'NOT_IMPLEMENTED',
        queueCommitAck: 'INHERITED_CI', remoteR2CdnLastByte: 'NOT_PROVEN',
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
