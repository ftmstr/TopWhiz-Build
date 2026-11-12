import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http2 from 'node:http2';
import pg from 'pg';

// TUR130: real disposable PostgreSQL16 + physical localhost HTTP/2 RST_STREAM.
// A revoked transaction-local role must never escape an aborted transaction
// into the next request on the same pg.Pool(max:1) physical backend.
// This is NOT a production Next/workerd Request.signal bridge or a COMMIT-ACK test.
const raw = process.env.TEST_DATABASE_URL || '';
const url = (() => { try { return new URL(raw); } catch { return null; } })();
if (process.env.CI !== 'true' || process.env.TUR130_DISPOSABLE_PG16 !== '1' ||
    !url || url.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '5432' || url.pathname !== '/topwhiz_test' ||
    decodeURIComponent(url.username) !== 'topwhiz_test' || url.search || url.hash)
  throw Error('TUR130 requires explicitly authorized disposable localhost PG16');

const suffix = randomBytes(5).toString('hex');
const broker = 'tw130_broker_' + suffix;
const executor = 'tw130_executor_' + suffix;
const adminRole = 'tw130_admin_' + suffix;
const schema = 'tw130_gate_' + suffix;
const table = schema + '.synthetic_rows';
const brokerPassword = randomBytes(20).toString('hex');
const adminPassword = randomBytes(20).toString('hex');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function loginUrl(user, password) {
  const u = new URL(raw);
  u.username = user;
  u.password = password;
  return u.href;
}
async function denied(promise, code) {
  await assert.rejects(promise, e => e?.code === code);
}

test('PG16 revoked SET LOCAL ROLE + SQL abort + physical HTTP2 RST rolls back before pooled handoff', { timeout: 120000 }, async () => {
  const root = new pg.Client({ connectionString: raw });
  let admin, pool, server, h2, rootConnected = false, adminConnected = false;
  const ready = deferred(), proceed = deferred(), sqlAborted = deferred(), finished = deferred();
  let A, aPid, aBackendStart, txOpen = false, serverRstCode = null;
  try {
    await root.connect(); rootConnected = true;
    const version = Number((await root.query("SELECT current_setting('server_version_num') AS n")).rows[0].n);
    assert.ok(version >= 160000 && version < 170000, 'must use real PostgreSQL16');
    await root.query("CREATE ROLE " + executor + " NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION");
    await root.query("CREATE ROLE " + broker + " LOGIN PASSWORD '" + brokerPassword + "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION");
    await root.query("CREATE ROLE " + adminRole + " LOGIN PASSWORD '" + adminPassword + "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION");
    await root.query('GRANT ' + executor + ' TO ' + adminRole + ' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');
    await root.query('CREATE SCHEMA ' + schema + ' AUTHORIZATION ' + executor);
    await root.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    await root.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' + broker);
    await root.query('CREATE TABLE ' + table + ' (id integer PRIMARY KEY, value text NOT NULL)');
    await root.query('ALTER TABLE ' + table + ' OWNER TO ' + executor);
    admin = new pg.Client({ connectionString: loginUrl(adminRole, adminPassword) });
    await admin.connect(); adminConnected = true;
    const restricted = (await admin.query(
      "SELECT rolsuper,rolcreaterole,pg_has_role(session_user,'pg_signal_backend','member') AS broad FROM pg_roles WHERE rolname=session_user"
    )).rows[0];
    assert.deepEqual(restricted, { rolsuper: false, rolcreaterole: false, broad: false });
    await admin.query('GRANT ' + executor + ' TO ' + broker + ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE');
    pool = new pg.Pool({ connectionString: loginUrl(broker, brokerPassword), max: 1, idleTimeoutMillis: 30000 });

    server = http2.createServer();
    server.on('stream', async (stream, headers) => {
      if (headers[':path'] !== '/synthetic/abort') {
        stream.respond({ ':status': 404 }); stream.end(); return;
      }
      const closed = deferred();
      stream.on('close', () => { serverRstCode = stream.rstCode; closed.resolve(); });
      try {
        A = await pool.connect();
        aPid = (await A.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        aBackendStart = (await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [aPid])).rows[0].backend_start;
        await A.query('BEGIN'); txOpen = true;
        await A.query('SET LOCAL ROLE ' + executor);
        assert.equal((await A.query('SELECT current_user AS u')).rows[0].u, executor);
        await A.query('INSERT INTO ' + table + " VALUES (1301,'uncommitted')");
        stream.respond({ ':status': 200, 'cache-control': 'no-store' });
        ready.resolve();
        await proceed.promise;
        // Unique-key violation aborts the transaction, not just one statement.
        await denied(A.query('INSERT INTO ' + table + " VALUES (1301,'duplicate')"), '23505');
        await denied(A.query('SELECT current_user'), '25P02');
        sqlAborted.resolve();
        // Actual client sends HTTP/2 RST_STREAM; no HTTP body is sent.
        await closed.promise;
        await A.query('ROLLBACK'); txOpen = false;
        finished.resolve();
      } catch (error) {
        ready.reject(error); sqlAborted.reject(error); finished.reject(error);
      } finally {
        if (A) {
          if (txOpen) await A.query('ROLLBACK').catch(() => {});
          A.release();
        }
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    h2 = http2.connect('http://127.0.0.1:' + port);
    h2.on('error', () => {});
    const request = h2.request({ ':method': 'GET', ':path': '/synthetic/abort' });
    request.on('error', () => {});
    request.on('data', () => { throw Error('No synthetic media bytes may be emitted'); });
    request.end();
    await ready.promise;

    // Independent restricted rights administrator commits revocation while A
    // still has the effective transaction-local executor identity.
    await admin.query('BEGIN');
    await admin.query('REVOKE ' + executor + ' FROM ' + broker);
    await admin.query('COMMIT');
    assert.equal((await root.query('SELECT pg_has_role($1,$2,$3) AS ok',
      [broker, executor, 'SET'])).rows[0].ok, false);
    proceed.resolve();
    await sqlAborted.promise;
    request.close(http2.constants.NGHTTP2_CANCEL);
    await finished.promise;
    assert.equal(serverRstCode, http2.constants.NGHTTP2_CANCEL);
    assert.equal((await root.query('SELECT count(*)::integer AS n FROM ' + table)).rows[0].n, 0,
      'aborted transaction must not commit synthetic rows');

    const B = await pool.connect();
    try {
      const identity = (await B.query('SELECT pg_backend_pid() AS pid, session_user AS s, current_user AS u')).rows[0];
      assert.equal(identity.pid, aPid, 'must reuse the same physical backend');
      assert.equal(identity.s, broker);
      assert.equal(identity.u, broker);
      const start = (await root.query('SELECT backend_start FROM pg_stat_activity WHERE pid=$1', [aPid])).rows[0].backend_start;
      assert.equal(new Date(start).getTime(), new Date(aBackendStart).getTime());
      await denied(B.query('SET ROLE ' + executor), '42501');
      await denied(B.query('SELECT * FROM ' + table), '42501');
      assert.equal(pool.totalCount, 1);
    } finally { B.release(); }
    const C = await pool.connect();
    try {
      assert.equal((await C.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, aPid);
      assert.equal((await C.query('SELECT current_user AS u')).rows[0].u, broker);
    } finally { C.release(); }

    console.log(JSON.stringify({
      suite: 'TUR130_REAL_PG16_HTTP2_RST_ABORTED_SET_LOCAL_ROLE_POOL_HANDOFF',
      actualPgMajor: 16, restrictedRightsAdmin: true,
      independentRevokeCommittedBeforeRst: true, sqlstateDuplicate: '23505',
      sqlstateAbortedTransaction: '25P02', physicalHttp2RstStream: 'NGHTTP2_CANCEL',
      transactionRolledBack: true, uncommittedRowsAfterRst: 0,
      samePoolBackendPidAndStartAtoBtoC: true,
      deniedNewSetRoleAndPrivateRead: '42501',
      productionRequestSignalBridge: 'NOT_PROVEN',
      commitAckLoss: 'NOT_TESTED', osPidRecycle: 'NOT_TESTED',
      remoteR2CdnReceiverLastByte: 'NOT_PROVEN',
      issue22: 'OPEN', release: 'NO_GO'
    }));
  } finally {
    proceed.resolve();
    if (h2) h2.destroy();
    if (server) await new Promise(resolve => server.close(() => resolve())).catch(() => {});
    if (pool) await pool.end().catch(() => {});
    if (adminConnected) await admin.end().catch(() => {});
    if (rootConnected) {
      await root.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
      await root.query('REVOKE ' + executor + ' FROM ' + adminRole).catch(() => {});
      for (const role of [broker, adminRole, executor]) {
        await root.query('DROP OWNED BY ' + role + ' CASCADE').catch(() => {});
        await root.query('DROP ROLE IF EXISTS ' + role).catch(() => {});
      }
    }
    await root.end().catch(() => {});
  }
});
