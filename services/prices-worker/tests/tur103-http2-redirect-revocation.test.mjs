import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Synthetic loopback h2c redirect/origin trust boundary. No R2/CDN or remote-wire guarantee.
const secret = Buffer.from('tur103-synthetic-not-a-production-key');
const bodies = Object.freeze({ 'asset-a': 'ADATA123', 'asset-b': 'BDATA123' });

function sign(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('hex')}`;
}

function verify(ticket) {
  if (typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const received = Buffer.from(parts[1], 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (payload?.asset !== 'asset-a' || !Number.isSafeInteger(payload.epoch)) return null;
    return payload;
  } catch { return null; }
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function get(url) {
  const target = new URL(url);
  const session = http2.connect(target.origin);
  try {
    return await new Promise((resolve, reject) => {
      const stream = session.request({ ':method': 'GET', ':path': target.pathname + target.search });
      let status;
      let location;
      const chunks = [];
      const timeout = setTimeout(() => {
        stream.close(http2.constants.NGHTTP2_CANCEL);
        reject(new Error('HTTP/2 synthetic request timeout'));
      }, 5000);
      stream.on('response', headers => { status = headers[':status']; location = headers.location; });
      stream.on('data', data => chunks.push(data));
      stream.once('end', () => {
        clearTimeout(timeout);
        resolve({ status, location, body: Buffer.concat(chunks).toString('utf8') });
      });
      stream.once('error', error => { clearTimeout(timeout); reject(error); });
      stream.end();
    });
  } finally { session.close(); }
}

async function fixture(mode) {
  let epoch = 1;
  let alias = 'asset-a';
  let authorityAvailable = true;
  const origin = http2.createServer();
  origin.on('stream', (stream, headers) => {
    const url = new URL(headers[':path'], 'http://synthetic.invalid');
    const grant = verify(url.searchParams.get('grant'));
    if (url.pathname !== '/resolve/alias' || !grant) {
      stream.respond({ ':status': 403 }); stream.end(); return;
    }
    // An authentic signature is NOT a revocation check or an immutable object binding.
    if (mode === 'guarded' && (!authorityAvailable || grant.epoch !== epoch || grant.asset !== alias)) {
      stream.respond({ ':status': 403 }); stream.end(); return;
    }
    stream.respond({ ':status': 200, 'content-type': 'application/octet-stream' });
    stream.end(bodies[alias]);
  });
  const originUrl = await listen(origin);
  const gateway = http2.createServer();
  gateway.on('stream', stream => {
    const grant = sign({ asset: 'asset-a', epoch });
    stream.respond({ ':status': 307, location: `${originUrl}/resolve/alias?grant=${encodeURIComponent(grant)}` });
    stream.end();
  });
  const gatewayUrl = await listen(gateway);
  return {
    async redirect() {
      const response = await get(`${gatewayUrl}/media/asset-a`);
      assert.equal(response.status, 307);
      assert.equal(response.body, '');
      assert.ok(response.location.startsWith(`${originUrl}/resolve/alias?grant=`));
      return response.location;
    },
    follow: get,
    revoke() { epoch += 1; return { acknowledged: true, epoch }; },
    retarget() { alias = 'asset-b'; },
    outage() { authorityAvailable = false; },
    async close() { await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => origin.close(resolve))]); }
  };
}

test('unsafe HTTP/2 origin accepts authentic redirect grant after revocation ACK', { timeout: 15000 }, async () => {
  const f = await fixture('unsafe');
  try {
    const redirect = await f.redirect();
    assert.equal(f.revoke().epoch, 2);
    const response = await f.follow(redirect);
    assert.equal(response.status, 200);
    assert.equal(response.body, 'ADATA123'); // Eight synthetic bytes delivered after ACK.
  } finally { await f.close(); }
});

test('guarded origin rejects authentic but stale redirect grant after revocation ACK', { timeout: 15000 }, async () => {
  const f = await fixture('guarded');
  try {
    const redirect = await f.redirect();
    assert.equal(f.revoke().acknowledged, true);
    const response = await f.follow(redirect);
    assert.equal(response.status, 403);
    assert.equal(response.body, '');
  } finally { await f.close(); }
});

test('signed asset-a redirect cannot authorize retargeted asset-b in guarded origin', { timeout: 15000 }, async () => {
  const unsafe = await fixture('unsafe');
  try {
    const redirect = await unsafe.redirect();
    unsafe.retarget();
    const response = await unsafe.follow(redirect);
    assert.equal(response.status, 200);
    assert.equal(response.body, 'BDATA123'); // Cross-object alias confusion.
  } finally { await unsafe.close(); }
  const guarded = await fixture('guarded');
  try {
    const redirect = await guarded.redirect();
    guarded.retarget();
    const response = await guarded.follow(redirect);
    assert.equal(response.status, 403);
    assert.equal(response.body, '');
  } finally { await guarded.close(); }
});

test('guarded redirect origin fails closed when independent authority is unavailable', { timeout: 15000 }, async () => {
  const f = await fixture('guarded');
  try {
    const redirect = await f.redirect();
    f.outage();
    const response = await f.follow(redirect);
    assert.equal(response.status, 403);
    assert.equal(response.body, '');
  } finally { await f.close(); }
});
