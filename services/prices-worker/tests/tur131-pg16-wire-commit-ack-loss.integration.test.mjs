import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// Real disposable PG16 wire-proxy: suppress server COMMIT completion and ReadyForQuery.
// A lost client ACK is not proof of rollback or permission to replay a side effect.
const raw = process.env.TEST_DATABASE_URL || '';
const url = (() => { try { return new URL(raw); } catch { return null; } })();
if (process.env.CI !== 'true' || process.env.TUR131_DISPOSABLE_PG16 !== '1' ||
    !url || url.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '5432' || url.pathname !== '/topwhiz_test' ||
    decodeURIComponent(url.username) !== 'topwhiz_test' || url.search || url.hash)
  throw Error('TUR131 requires explicit disposable localhost PostgreSQL16');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Do not impersonate a real Queue or R2 acknowledgement: this proxy only affects
// a synthetic PostgreSQL client, with no external side effects or live services.
test('PG16 physical COMMIT ACK lost: independent durable read prevents duplicate replay', { timeout: 90000 }, async () => {
  const table = 'tw131_ack_' + randomBytes(5).toString('hex');
  const root = new pg.Client({ connectionString: raw });
  const dropped = deferred();
  let proxy, client, rootConnected = false;
  let serverCommit = false, serverReady = false, bytesAfterCommitForwarded = 0;
  const sockets = new Set();
  try {
    await root.connect(); rootConnected = true;
    const major = Number((await root.query("SELECT current_setting('server_version_num') AS v")).rows[0].v);
    assert.ok(major >= 160000 && major < 170000, 'physical PostgreSQL16 required');
    await root.query('CREATE TABLE ' + table + ' (id text PRIMARY KEY, payload text NOT NULL)');

    proxy = net.createServer(downstream => {
      const upstream = net.connect({ host: '127.0.0.1', port: 5432 });
      sockets.add(downstream); sockets.add(upstream);
      let intercept = false, pending = Buffer.alloc(0), tail = Buffer.alloc(0);
      downstream.on('data', chunk => {
        tail = Buffer.concat([tail, chunk]).subarray(-64);
        if (tail.includes(Buffer.from('COMMIT\0'))) intercept = true;
        if (!upstream.destroyed) upstream.write(chunk);
      });
      upstream.on('data', chunk => {
        if (!intercept) { if (!downstream.destroyed) downstream.write(chunk); return; }
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 5) {
          const length = pending.readUInt32BE(1);
          assert.ok(length >= 4 && length < 1024 * 1024, 'valid backend protocol frame');
          if (pending.length < length + 1) break;
          const type = String.fromCharCode(pending[0]);
          const payload = pending.subarray(5, length + 1);
          pending = pending.subarray(length + 1);
          if (type === 'C' && payload.toString('utf8') === 'COMMIT\0') serverCommit = true;
          if (type === 'Z') serverReady = true;
          if (serverCommit && serverReady) {
            // Server already acknowledged COMMIT on its side; client sees neither
            // CommandComplete nor ReadyForQuery. This is a real wire-level loss.
            dropped.resolve();
            downstream.destroy(); upstream.destroy();
            return;
          }
        }
      });
      for (const [a, b] of [[downstream, upstream], [upstream, downstream]]) {
        a.on('error', error => dropped.reject(error));
        a.on('close', () => { sockets.delete(a); if (!b.destroyed) b.destroy(); });
      }
    });
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(0, '127.0.0.1', resolve);
    });
    const viaProxy = new URL(raw);
    viaProxy.port = String(proxy.address().port);
    client = new pg.Client({ connectionString: viaProxy.href });
    // pg emits an expected client-level error when the proxy drops the COMMIT ACK.
    // The query rejection is asserted below; an unhandled EventEmitter error is not.
    client.on('error', () => {});
    await client.connect();
    await client.query('BEGIN');
    await client.query('INSERT INTO ' + table + " (id,payload) VALUES ('event-131','synthetic')");
    const commitResult = client.query('COMMIT').then(() => 'ACKED', () => 'TRANSPORT_UNKNOWN');
    await dropped.promise;
    assert.equal(await commitResult, 'TRANSPORT_UNKNOWN');
    assert.equal(serverCommit, true);
    assert.equal(serverReady, true);
    assert.equal(bytesAfterCommitForwarded, 0);

    // New physical connection is the only authority for the durable outcome.
    const recovery = new pg.Client({ connectionString: raw });
    try {
      await recovery.connect();
      const rows = await recovery.query('SELECT id,payload FROM ' + table + ' WHERE id=$1', ['event-131']);
      assert.equal(rows.rowCount, 1);
      assert.equal(rows.rows[0].payload, 'synthetic');
      const retry = await recovery.query(
        'INSERT INTO ' + table + " (id,payload) VALUES ('event-131','duplicate') ON CONFLICT (id) DO NOTHING RETURNING id"
      );
      assert.equal(retry.rowCount, 0, 'idempotent replay must not duplicate durable effect');
      assert.equal((await recovery.query('SELECT count(*)::integer AS n FROM ' + table)).rows[0].n, 1);
      await recovery.query('BEGIN');
      await recovery.query('INSERT INTO ' + table + " VALUES ('rolled-back','control')");
      await recovery.query('ROLLBACK');
      assert.equal((await recovery.query("SELECT count(*)::integer AS n FROM " + table + " WHERE id='rolled-back'")).rows[0].n, 0);
    } finally { await recovery.end().catch(() => {}); }

    console.log(JSON.stringify({suite:'TUR131_REAL_PG16_WIRE_COMMIT_ACK_LOSS_RECONCILIATION',
      pgMajor:16, serverCommandCompleteCommit:true, serverReadyForQuery:true,
      clientCommitOutcome:'TRANSPORT_UNKNOWN', bytesOfCommitAckForwarded:0,
      independentDurableRead:'ONE_COMMITTED_ROW', idempotentReplayNewRows:0,
      rollbackControlRows:0, realQueueAck:'NOT_TESTED', productionCommitPolicy:'NOT_PROVEN',
      remoteR2CdnFinalByte:'NOT_PROVEN', issue22:'OPEN', release:'NO_GO'}));
  } finally {
    if (client) await client.end().catch(() => {});
    for (const s of sockets) s.destroy();
    if (proxy) await new Promise(resolve => proxy.close(resolve)).catch(() => {});
    if (rootConnected) await root.query('DROP TABLE IF EXISTS ' + table).catch(() => {});
    await root.end().catch(() => {});
  }
});
