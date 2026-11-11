import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';

// Loopback-only adversarial model. A signed grant proves origin/integrity, NOT freshness.
// These fictional bytes and test-only HMAC key are never production credentials.
const key = Buffer.from('topwhiz-tur094-synthetic-hmac-test-key');
const now = 1000;
const grant = { media: 'synthetic-asset', generation: 1, expires: now + 100 };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const mac = body => createHmac('sha256', key).update(body).digest('base64url');
const sign = payload => { const body = encode(payload); return body + '.' + mac(body); };
const oldReceipt = sign(grant);

function verify(receipt) {
  try {
    if (typeof receipt !== 'string') return null;
    const pieces = receipt.split('.');
    if (pieces.length !== 2) return null;
    const [body, supplied] = pieces;
    const actual = Buffer.from(mac(body), 'base64url');
    const claimed = Buffer.from(supplied, 'base64url');
    if (claimed.length !== actual.length || !timingSafeEqual(actual, claimed)) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.media !== 'synthetic-asset' || !Number.isSafeInteger(p.generation) ||
        p.generation < 1 || !Number.isSafeInteger(p.expires) || p.expires <= now) return null;
    return p;
  } catch { return null; }
}

async function publisher({ authority, receiptOnly }) {
  const held = new Set();
  const permitted = receipt => {
    const p = verify(receipt);
    if (!p) return false;
    if (receiptOnly) return true; // deliberately unsafe: cryptographic authenticity != current right
    try {
      const current = authority(); // illustrative independently supplied value, NOT a durable authority
      return Number.isSafeInteger(current) && current === p.generation;
    } catch { return false; }
  };
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    const receipt = headers['x-test-receipt'];
    if (headers[':path'] !== '/media') { stream.respond({ ':status': 404 }); stream.end(); return; }
    if (!permitted(receipt)) {
      stream.respond({ ':status': 403, 'cache-control': 'no-store' }); stream.end(); return;
    }
    stream.respond({ ':status': 200, 'cache-control': 'no-store' });
    held.add({ stream, receipt });
    stream.write('ABCD');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    async flush() {
      const active = [...held];
      const closing = active.map(({ stream }) => stream.closed || stream.destroyed ? Promise.resolve() : once(stream, 'close'));
      for (const { stream, receipt } of active) {
        if (permitted(receipt)) stream.end('EFGH');
        else stream.close(http2.constants.NGHTTP2_CANCEL);
      }
      await Promise.all(closing);
      held.clear();
    },
    async close() {
      for (const { stream } of held) stream.close(http2.constants.NGHTTP2_CANCEL);
      server.close();
      await once(server, 'close');
    },
  };
}
function request(port, receipt) {
  const client = http2.connect('http://127.0.0.1:' + port);
  client.on('error', () => {});
  const stream = client.request({ ':path': '/media', 'x-test-receipt': receipt });
  const chunks = [];
  let status;
  let firstResolve;
  const first = new Promise(resolve => { firstResolve = resolve; });
  const done = new Promise(resolve => {
    stream.on('response', headers => { status = headers[':status']; });
    stream.on('data', data => { chunks.push(data); firstResolve(); });
    stream.once('end', resolve);
    stream.once('close', resolve);
    stream.once('error', resolve);
  });
  return { first, done, get status() { return status; },
    get body() { return Buffer.concat(chunks).toString(); }, close() { client.destroy(); } };
}

async function withServer(opts, fn) {
  const p = await publisher(opts);
  const clients = [];
  const get = receipt => { const c = request(p.port, receipt); clients.push(c); return c; };
  try { await fn({ p, get }); }
  finally { clients.forEach(c => c.close()); await p.close(); }
}

test('authentic old signed grant replays eight fictional bytes after revocation and publisher restart', { timeout: 12000 }, async () => {
  let generation = 1;
  // Signed grant is issued before revocation, and remains authentic after the authority changes.
  assert.equal(verify(oldReceipt).generation, 1);
  generation = 2;
  await withServer({ receiptOnly: true, authority: () => generation }, async ({ p, get }) => {
    const r = get(oldReceipt);
    await r.first;
    assert.equal(r.status, 200);
    await p.flush(); await r.done;
    assert.equal(r.body, 'ABCDEFGH');
    assert.equal(Buffer.byteLength(r.body), 8);
  });
});

test('tampering, wrong scope, and expired signed grant are denied', { timeout: 12000 }, async () => {
  const [body, sig] = oldReceipt.split('.');
  const tampered = sign({ ...grant, generation: 2 }).split('.')[0] + '.' + sig;
  const badScope = sign({ ...grant, media: 'other-asset' });
  const expired = sign({ ...grant, expires: now });
  assert.notEqual(tampered, oldReceipt);
  await withServer({ receiptOnly: true, authority: () => 1 }, async ({ get }) => {
    for (const token of [tampered, badScope, expired, body + '.bogus']) {
      const r = get(token);
      await r.done;
      assert.equal(r.status, 403);
      assert.equal(r.body, '');
    }
  });
});

test('fresh authority lookup fences old grant and held HTTP/2 tail; unavailable authority fails closed', { timeout: 12000 }, async () => {
  let generation = 1;
  await withServer({ receiptOnly: false, authority: () => generation }, async ({ p, get }) => {
    const held = get(oldReceipt);
    await held.first;
    assert.equal(held.body, 'ABCD');
    generation = 2;
    await p.flush(); await held.done;
    assert.equal(held.body.includes('EFGH'), false);
    const denied = get(oldReceipt);
    await denied.done;
    assert.equal(denied.status, 403);
    generation = null; // authority unreachable: fail closed, no stale signed receipt fallback
    const missing = get(oldReceipt);
    await missing.done;
    assert.equal(missing.status, 403);
  });
});
