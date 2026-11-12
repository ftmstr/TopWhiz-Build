import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// TUR124: actual disposable PostgreSQL16, not production IAM.
// Novel negative: REVOKE COMMIT prevents *future* SET ROLE, but does not
// necessarily unwind an already-active SET ROLE on a pooled SQL session.
const url = (() => { try { return new URL(process.env.TEST_DATABASE_URL || ''); } catch { return null; } })();
if (process.env.CI !== 'true' || process.env.TUR124_DISPOSABLE_PG16 !== '1' ||
    !url || url.protocol !== 'postgresql:' ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.port !== '5432' || url.pathname !== '/topwhiz_test' ||
    decodeURIComponent(url.username) !== 'topwhiz_test' || url.search || url.hash)
  throw Error('TUR124 requires explicitly authorized disposable localhost PG16');

const suffix = randomBytes(5).toString('hex');
const names = ['victim', 'definer', 'executor', 'relay', 'broker', 'admin', 'spectator']
  .map(x => 'tw124_' + x + '_' + suffix);
const pass = names.map(() => randomBytes(20).toString('hex'));
const schema = 'tw124_gate_' + suffix;
const fn = schema + '.cancel_foreign(integer)';
const call = 'SELECT ' + schema + '.cancel_foreign($1) AS cancelled';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitActive(root, pid, marker) {
  for (let i = 0; i < 160; i++) {
    const row = (await root.query('SELECT state,query FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
    if (row?.state === 'active' && row.query.includes(marker)) return;
    await sleep(25);
  }
  throw Error('Victim SQL did not enter pg_stat_activity: ' + marker);
}
async function running(victim, root, pid, marker, seconds) {
  const completion = victim.query('SELECT pg_sleep(' + seconds + '),' + marker + ' AS marker')
    .then(r => ({ marker: r.rows[0].marker }), error => ({ error }));
  await waitActive(root, pid, 'pg_sleep(' + seconds + ')');
  return { completion };
}
async function denied(promise) {
  await assert.rejects(promise, e => e?.code === '42501');
}

test('committed transitive membership REVOKE leaves already SET ROLE executor active until RESET ROLE', { timeout: 120000 }, async () => {
  const root = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  const sessions = [];
  let connected = false, pool;
  try {
    await root.connect(); connected = true;
    const version = Number((await root.query("SELECT current_setting('server_version_num') AS n")).rows[0].n);
    assert.ok(version >= 160000 && version < 170000, 'physical PostgreSQL16 required');
    for (let i = 0; i < names.length; i++) {
      const login = [0, 4, 5, 6].includes(i) ? 'LOGIN' : 'NOLOGIN';
      await root.query('CREATE ROLE ' + names[i] + ' ' + login +
        ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION' +
        (login === 'LOGIN' ? " PASSWORD '" + pass[i] + "'" : ''));
    }
    await root.query('GRANT ' + names[0] + ' TO ' + names[1] +
      ' WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
    await root.query('CREATE SCHEMA ' + schema + ' AUTHORIZATION ' + names[1]);
    await root.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    await root.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' +
      [names[2], names[4], names[5], names[6]].join(','));
    await root.query('CREATE FUNCTION ' + schema +
      '.cancel_foreign(in_pid integer) RETURNS boolean LANGUAGE plpgsql ' +
      'SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$ ' +
      'BEGIN RETURN pg_catalog.pg_cancel_backend(in_pid); END; $f$');
    await root.query('ALTER FUNCTION ' + fn + ' OWNER TO ' + names[1]);
    await root.query('REVOKE ALL ON FUNCTION ' + fn + ' FROM PUBLIC');
    await root.query('GRANT EXECUTE ON FUNCTION ' + fn + ' TO ' + names[2]);
    await root.query('GRANT ' + names[2] + ' TO ' + names[3] +
      ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');
    await root.query('GRANT ' + names[3] + ' TO ' + names[5] +
      ' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');

    function loginUrl(i) {
      const u = new URL(process.env.TEST_DATABASE_URL);
      u.username = names[i]; u.password = pass[i];
      return u.href;
    }
    async function login(i) {
      const c = new pg.Client({ connectionString: loginUrl(i) });
      await c.connect(); sessions.push(c);
      const role = (await c.query(
        "SELECT session_user,rolsuper,rolcreaterole," +
        "pg_has_role(session_user,'pg_signal_backend','member') AS broad " +
        "FROM pg_roles WHERE rolname=session_user")).rows[0];
      assert.equal(role.session_user, names[i]);
      assert.equal(role.rolsuper, false);
      assert.equal(role.rolcreaterole, false);
      assert.equal(role.broad, false);
      return c;
    }
    const broker = await login(4), admin = await login(5), spectator = await login(6);
    await denied(spectator.query('GRANT ' + names[3] + ' TO ' + names[4]));
    await admin.query('GRANT ' + names[3] + ' TO ' + names[4] +
      ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');
    const membership = (await root.query(
      'SELECT grantor::regrole::text AS grantor,inherit_option,set_option ' +
      'FROM pg_auth_members WHERE roleid=$1::regrole AND member=$2::regrole',
      [names[3], names[4]])).rows[0];
    assert.deepEqual(membership, { grantor: names[5], inherit_option: false, set_option: true });
    assert.equal((await root.query('SELECT pg_has_role($1,$2,$3) AS ok',
      [names[4], names[2], 'SET'])).rows[0].ok, true);
    await denied(broker.query(call, [1]));

    pool = new pg.Pool({ connectionString: loginUrl(0), max: 1, idleTimeoutMillis: 30000 });
    const A = await pool.connect();
    let pid, backendStart;
    try {
      pid = (await A.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      backendStart = (await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1',
        [pid])).rows[0].backend_start;
    } finally { A.release(); }
    const B = await pool.connect();
    try {
      const reusedPid = (await B.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const reusedStart = (await root.query(
        'SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [reusedPid])).rows[0].backend_start;
      assert.equal(reusedPid, pid);
      assert.equal(new Date(reusedStart).getTime(), new Date(backendStart).getTime());
      assert.equal(pool.totalCount, 1);

      await broker.query('SET ROLE ' + names[2]);
      const before = (await broker.query('SELECT session_user AS s,current_user AS c')).rows[0];
      assert.deepEqual(before, { s: names[4], c: names[2] });
      await denied(broker.query('SELECT pg_cancel_backend($1)', [pid]));

      // The separately authenticated admin commits the membership revoke
      // WHILE the broker's SQL session is already SET ROLE executor.
      await admin.query('BEGIN');
      try {
        await admin.query('REVOKE ' + names[3] + ' FROM ' + names[4]);
        await admin.query('COMMIT');
      } catch (e) {
        await admin.query('ROLLBACK').catch(() => {});
        throw e;
      }
      assert.equal((await root.query('SELECT pg_has_role($1,$2,$3) AS ok',
        [names[4], names[2], 'SET'])).rows[0].ok, false);
      const stillActive = (await broker.query('SELECT session_user AS s,current_user AS c')).rows[0];
      assert.deepEqual(stillActive, { s: names[4], c: names[2] },
        'committed membership REVOKE does not RESET an already active role');

      const foreign = (await running(B, root, pid, 1241, 6)).completion;
      assert.equal((await broker.query(call, [pid])).rows[0].cancelled, true,
        'active SET ROLE can still call privileged function after REVOKE COMMIT');
      assert.equal((await foreign).error?.code, '57014');
      await broker.query('RESET ROLE');
      await denied(broker.query('SET ROLE ' + names[2]));
      await denied(broker.query(call, [pid]));
      const safe = (await running(B, root, pid, 1242, 1.2)).completion;
      await denied(broker.query('SET ROLE ' + names[2]));
      assert.deepEqual(await safe, { marker: 1242 });
      console.log(JSON.stringify({
        suite: 'TUR124_PG16_ACTIVE_SET_ROLE_SURVIVES_MEMBERSHIP_REVOKE_COMMIT',
        actualPostgresMajor: 16, independentRestrictedLogins: 4,
        independentRightsAdminGrantor: true, transitiveSetTrueInheritFalse: true,
        physicalPoolMax1AtoBBackendIdentity: true,
        committedRevokeRemovesFutureSetPermission: true,
        activeCurrentUserPersistsAfterRevoke: true,
        postCommitForeignCancel57014: true, afterResetSetRoleDenied42501: true,
        afterResetVictimMarker: 1242, globalPgSignalBackendGranted: false,
        productionFix: 'NOT_IMPLEMENTED', lostCommitAck: 'NOT_TESTED',
        requestSignal: 'NOT_PROVEN', remoteReceiverLastByte: 'NOT_PROVEN',
        issue22: 'OPEN', release: 'NO_GO'
      }));
    } finally { B.release(); }
  } finally {
    if (pool) await pool.end().catch(() => {});
    for (const c of sessions) await c.end().catch(() => {});
    if (connected) {
      await root.query('DROP OWNED BY ' + names.join(',') + ' CASCADE').catch(() => {});
      await root.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
      for (const name of [...names].reverse())
        await root.query('DROP ROLE IF EXISTS ' + name).catch(() => {});
    }
    await root.end().catch(() => {});
  }
});
