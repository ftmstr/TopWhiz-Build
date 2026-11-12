import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// TUR128: quarantining a dirty pooled backend must destroy its physical
// session; transaction-failed DISCARD ALL is never a successful cleanup ACK.
// Disposable localhost PostgreSQL16 only. No production remediation.
const raw = process.env.TEST_DATABASE_URL || '';
const url = (() => { try { return new URL(raw); } catch { return null; } })();
if (process.env.CI !== 'true' || process.env.TUR128_DISPOSABLE_PG16 !== '1' ||
    !url || url.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '5432' || url.pathname !== '/topwhiz_test' ||
    decodeURIComponent(url.username) !== 'topwhiz_test' || url.search || url.hash)
  throw Error('TUR128 requires authorized disposable localhost PostgreSQL16');

const suffix = randomBytes(5).toString('hex');
const [owner, executor, broker, admin] =
  ['owner', 'executor', 'broker', 'admin'].map(s => 'tw128_' + s + '_' + suffix);
const schema = 'tw128_acl_' + suffix;
const password = randomBytes(24).toString('hex');
const adminPassword = randomBytes(24).toString('hex');
const readSql = 'SELECT secret FROM ' + schema + '.private_record';
const loginUrl = (name, pass) => {
  const u = new URL(raw);
  u.username = name;
  u.password = pass;
  return u.href;
};
const deny = p => assert.rejects(p, e => e?.code === '42501');

test('failed transactional DISCARD ALL quarantines physical PG16 backend; new pool checkout cannot inherit revoked SET ROLE', { timeout: 60000 }, async () => {
  const root = new pg.Client({ connectionString: raw });
  let pool, adminClient, rootConnected = false;
  try {
    await root.connect();
    rootConnected = true;
    const version = Number((await root.query("SELECT current_setting('server_version_num') AS v")).rows[0].v);
    assert.ok(version >= 160000 && version < 170000, 'real PostgreSQL16 required');
    for (const name of [owner, executor])
      await root.query('CREATE ROLE ' + name +
        ' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION');
    await root.query("CREATE ROLE " + broker +
      " LOGIN PASSWORD '" + password + "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION");
    await root.query("CREATE ROLE " + admin +
      " LOGIN PASSWORD '" + adminPassword + "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION");
    await root.query('CREATE SCHEMA ' + schema + ' AUTHORIZATION ' + owner);
    await root.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    await root.query('CREATE TABLE ' + schema + '.private_record (secret integer NOT NULL)');
    await root.query('INSERT INTO ' + schema + '.private_record VALUES (128)');
    await root.query('REVOKE ALL ON ' + schema + '.private_record FROM PUBLIC');
    await root.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' + executor);
    await root.query('GRANT SELECT ON ' + schema + '.private_record TO ' + executor);
    await root.query('GRANT ' + executor + ' TO ' + admin +
      ' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');

    adminClient = new pg.Client({ connectionString: loginUrl(admin, adminPassword) });
    await adminClient.connect();
    const identity = (await adminClient.query(
      "SELECT rolsuper,rolcreaterole,pg_has_role(session_user,'pg_signal_backend','member') AS broad FROM pg_roles WHERE rolname=session_user"
    )).rows[0];
    assert.deepEqual(identity, { rolsuper: false, rolcreaterole: false, broad: false });
    await adminClient.query('GRANT ' + executor + ' TO ' + broker +
      ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');

    pool = new pg.Pool({ connectionString: loginUrl(broker, password), max: 1, idleTimeoutMillis: 30000 });
    const A = await pool.connect();
    let oldPid, oldStart;
    try {
      oldPid = (await A.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      oldStart = (await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [oldPid])).rows[0].backend_start;
      await deny(A.query(readSql));
      await A.query('SET ROLE ' + executor);
      assert.equal((await A.query(readSql)).rows[0].secret, 128);
    } finally { A.release(); }

    await adminClient.query('BEGIN');
    try {
      await adminClient.query('REVOKE ' + executor + ' FROM ' + broker);
      await adminClient.query('COMMIT');
    } catch (e) {
      await adminClient.query('ROLLBACK').catch(() => {});
      throw e;
    }
    assert.equal((await root.query('SELECT pg_has_role($1,$2,$3) AS allowed',
      [broker, executor, 'SET'])).rows[0].allowed, false);

    const B = await pool.connect();
    let quarantined = false;
    try {
      assert.equal((await B.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, oldPid);
      assert.equal((await B.query('SELECT current_user AS u')).rows[0].u, executor);
      assert.equal((await B.query(readSql)).rows[0].secret, 128,
        'committed REVOKE cannot retroactively sanitize active SET ROLE');
      await B.query('BEGIN');
      try {
        await assert.rejects(B.query('DISCARD ALL'), e => e?.code === '25001');
      } finally { await B.query('ROLLBACK'); }
      assert.equal((await B.query('SELECT current_user AS u')).rows[0].u, executor);
      assert.equal((await B.query(readSql)).rows[0].secret, 128,
        'failed cleanup is not a revocation receipt');
      // A dirty session is never returned to the reusable idle pool.
      B.release(true);
      quarantined = true;
    } finally {
      if (!quarantined) B.release(true);
    }
    assert.equal(pool.totalCount, 0, 'quarantine must remove the physical backend from pool');
    assert.equal(pool.idleCount, 0, 'dirty backend must not be idle/reusable');

    const C = await pool.connect();
    let freshPid, freshStart;
    try {
      freshPid = (await C.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      freshStart = (await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [freshPid])).rows[0].backend_start;
      assert.ok(freshPid !== oldPid ||
        new Date(freshStart).getTime() !== new Date(oldStart).getTime(),
        'replacement must be a new physical PostgreSQL backend, not the stale session');
      assert.deepEqual((await C.query('SELECT session_user AS s,current_user AS u')).rows[0],
        { s: broker, u: broker });
      await deny(C.query(readSql));
      await deny(C.query('SET ROLE ' + executor));
    } finally { C.release(); }

    const D = await pool.connect();
    try {
      assert.equal((await D.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, freshPid);
      assert.equal((await D.query('SELECT current_user AS u')).rows[0].u, broker);
      await deny(D.query(readSql));
      assert.equal(pool.totalCount, 1);
    } finally { D.release(); }
    console.log(JSON.stringify({
      suite: 'TUR128_REAL_PG16_DIRTY_POOL_QUARANTINE',
      pgMajor: 16, independentRestrictedAdminRevokeCommit: true,
      oldBackendLeakedAfterFailedDiscard: true,
      discardInsideTransactionSqlstate: '25001',
      dirtyBackendDestroyedNotIdle: true,
      replacementBackendDistinct: true,
      freshAndReusedCleanCheckoutDenied: '42501',
      globalPgSignalBackendGranted: false,
      productionFix: 'NOT_IMPLEMENTED', issue22: 'OPEN', release: 'NO_GO'
    }));
  } finally {
    if (pool) await pool.end().catch(() => {});
    if (adminClient) await adminClient.end().catch(() => {});
    if (rootConnected) {
      await root.query('DROP OWNED BY ' + [owner, executor, broker, admin].join(',') + ' CASCADE').catch(() => {});
      await root.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
      for (const name of [admin, broker, executor, owner])
        await root.query('DROP ROLE IF EXISTS ' + name).catch(() => {});
    }
    await root.end().catch(() => {});
  }
});
