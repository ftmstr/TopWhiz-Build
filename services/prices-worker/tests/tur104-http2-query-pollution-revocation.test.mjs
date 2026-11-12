import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Deterministic loopback h2c model only; no production R2/CDN/IAM or physical wire ACK.
const key = Buffer.from('topwhiz-tur104-test-only');
const media = Object.freeze({ 'asset-a': 'A104DATA', 'asset-b': 'B104DATA' });

function ticket(asset, generation) {
  const payload = Buffer.from(JSON.stringify({ asset, generation })).toString('base64url');
  return `${payload}.${createHmac('sha256', key).update(payload).digest('hex')}`;
}

function verified(value) {
  if (typeof value !== 'string') return null;
  const [encoded, mac, extra] = value.split('.');
  if (extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(encoded ?? '') || !/^[a-f0-9]{64}$/.test(mac ?? '')) return null;
  const expected = createHmac('sha256', key).update(encoded).digest();
  const received = Buffer.from(mac, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return typeof data?.asset === 'string' && Number.isSafeInteger(data.generation) ? data : null;
  } catch { return null; }
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function request(url) {
  const target = new URL(url);
  const client = http2.connect(target.origin);
  try {
    return await new Promise((resolve, reject) => {
      const stream = client.request({ ':method': 'GET', ':path': target.pathname + target.search });
      const parts = [];
      let status;
      let location;
      const timeout = setTimeout(() => { stream.close(http2.constants.NGHTTP2_CANCEL); reject(new Error('loopback HTTP/2 timeout')); }, 5000);
      stream.once('response', h => { status = h[':status']; location = h.location; });
      stream.on('data', b => parts.push(b));
      stream.once('end', () => { clearTimeout(timeout); resolve({ status, location, body: Buffer.concat(parts).toString('utf8') }); });
      stream.once('error', e => { clearTimeout(timeout); reject(e); });
      stream.end();
    });
  } finally { client.close(); }
}

async function fixture(guarded) {
  let generation = 1;
  let available = true;
  const origin = http2.createServer();
  origin.on('stream', (stream, headers) => {
    const raw = headers[':path'];
    const parsed = new URL(raw, 'http://synthetic.invalid');
    const grants = parsed.searchParams.getAll('grant');
    const assets = parsed.searchParams.getAll('asset');
    const grant = verified(grants[0]);
    const reject = () => { stream.respond({ ':status': 403 }); stream.end(); };
    if (parsed.pathname !== '/media' || !grant || assets.length === 0 || !(assets.at(-1) in media)) return reject();
    // Deliberately unsafe: authorization sees first value, retrieval sees last value.
    if (grant.asset !== assets[0]) return reject();
    if (guarded) {
      const canonical = `/media?grant=${grants[0]}&asset=${grant.asset}`;
      if (!available || grant.generation !== generation || grants.length !== 1 || assets.length !== 1 || raw !== canonical) return reject();
    }
    stream.respond({ ':status': 200, 'content-type': 'application/octet-stream' });
    stream.end(media[assets.at(-1)]);
  });
  const originUrl = await listen(origin);
  const gateway = http2.createServer();
  gateway.on('stream', stream => {
    const signed = ticket('asset-a', generation);
    stream.respond({ ':status': 307, location: `${originUrl}/media?grant=${signed}&asset=asset-a` });
    stream.end();
  });
  const gatewayUrl = await listen(gateway);
  return {
    async redirect() {
      const response = await request(`${gatewayUrl}/media/asset-a`);
      assert.equal(response.status, 307);
      assert.equal(response.body, '');
      assert.ok(response.location.startsWith(`${originUrl}/media?grant=`));
      return response.location;
    },
    request,
    revoke() { generation += 1; return { ack: true, generation }; },
    outage() { available = false; },
    async close() { await Promise.all([new Promise(r => gateway.close(r)), new Promise(r => origin.close(r))]); }
  };
}

test('unsafe origin: duplicate asset query changes signed grant asset-a into asset-b delivery', { timeout: 15000 }, async () => {
  const f = await fixture(false);
  try {
    const redirect = await f.redirect();
    const response = await f.request(`${redirect}&asset=asset-b`);
    assert.equal(response.status, 200);
    assert.equal(response.body, 'B104DATA'); // Eight synthetic wrong-object bytes.
  } finally { await f.close(); }
});

test('unsafe origin: query pollution still leaks after generation-2 revoke ACK', { timeout: 15000 }, async () => {
  const f = await fixture(false);
  try {
    const redirect = await f.redirect();
    assert.deepEqual(f.revoke(), { ack: true, generation: 2 });
    const response = await f.request(`${redirect}&asset=asset-b`);
    assert.equal(response.status, 200);
    assert.equal(response.body, 'B104DATA');
  } finally { await f.close(); }
});

test('guarded origin: canonical unrevoked request works, duplicate query and encoded alias fail', { timeout: 15000 }, async () => {
  const f = await fixture(true);
  try {
    const redirect = await f.redirect();
    assert.deepEqual(await f.request(redirect), { status: 200, location: undefined, body: 'A104DATA' });
    for (const changed of [`${redirect}&asset=asset-b`, redirect.replace('asset=asset-a', 'asset=%61sset-a'), `${redirect}&grant=forged`]) {
      const response = await f.request(changed);
      assert.equal(response.status, 403);
      assert.equal(response.body, '');
    }
  } finally { await f.close(); }
});

test('guarded origin: stale signed redirect rejected after revoke ACK and on authority outage', { timeout: 15000 }, async () => {
  const f = await fixture(true);
  try {
    const redirect = await f.redirect();
    assert.equal(f.revoke().generation, 2);
    const stale = await f.request(redirect);
    assert.equal(stale.status, 403);
    assert.equal(stale.body, '');
    const fresh = await f.redirect();
    f.outage();
    const outage = await f.request(fresh);
    assert.equal(outage.status, 403);
    assert.equal(outage.body, '');
  } finally { await f.close(); }
});
