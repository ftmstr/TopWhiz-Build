import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Synthetic h2c concurrency negative model. No real R2/CDN, IAM or wire-level proof.
const secret = Buffer.from('topwhiz-tur106-synthetic-only');
const objects = new Map([[1, 'OLD!'], [2, 'NEW!']]);
function ticket(generation) {
  const payload = Buffer.from(JSON.stringify({ asset: 'asset-a', generation })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}
function verify(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const provided = Buffer.from(parts[1], 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const obj = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return obj?.asset === 'asset-a' && [1, 2].includes(obj.generation) ? obj : null;
  } catch { return null; }
}
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function get(url, extra = {}) {
  const u = new URL(url);
  const client = http2.connect(u.origin);
  try {
    return await new Promise((resolve, reject) => {
      const req = client.request({ ':method': 'GET', ':path': u.pathname + u.search, ...extra });
      const chunks = [];
      let status;
      const timeout = setTimeout(() => { req.close(http2.constants.NGHTTP2_CANCEL); reject(new Error('local h2c request timeout')); }, 5000);
      req.once('response', headers => { status = headers[':status']; });
      req.on('data', chunk => chunks.push(chunk));
      req.once('end', () => { clearTimeout(timeout); resolve({ status, body: Buffer.concat(chunks).toString() }); });
      req.once('error', error => { clearTimeout(timeout); reject(error); });
      req.end();
    });
  } finally { client.close(); }
}
async function fixture(guarded, heldCount = 1) {
  let epoch = 1;
  let authorityAvailable = true;
  let cache = null;
  let originRequests = 0;
  const pendingReleases = [];
  const arrived = [];
  let notifyArrival;
  const arrival = new Promise(resolve => { notifyArrival = resolve; });
  const origin = http2.createServer();
  origin.on('stream', async (stream, headers) => {
    originRequests += 1;
    const requestEpoch = Number(headers['x-source-generation']);
    if (requestEpoch === 1 && pendingReleases.length < heldCount) {
      await new Promise(resolve => {
        pendingReleases.push(resolve);
        arrived.push(true);
        if (arrived.length === heldCount) notifyArrival();
      });
    }
    if (stream.destroyed) return;
    stream.respond({ ':status': 200, 'content-type': 'application/octet-stream' });
    stream.end(objects.get(requestEpoch) ?? 'BAD!');
  });
  const originUrl = await listen(origin);
  const gateway = http2.createServer();
  gateway.on('stream', async (stream, headers) => {
    const reject = status => { if (!stream.destroyed) { stream.respond({ ':status': status }); stream.end(); } };
    try {
      const url = new URL(headers[':path'], 'http://synthetic.invalid');
      const params = url.searchParams.getAll('grant');
      const grant = params.length === 1 ? verify(params[0]) : null;
      if (url.pathname !== '/media/asset-a' || !grant) return reject(403);
      const authorized = () => authorityAvailable && grant.generation === epoch;
      if (guarded && !authorized()) return reject(403);
      if (cache && (!guarded || cache.generation === grant.generation)) {
        if (guarded && !authorized()) return reject(403);
        stream.respond({ ':status': 200 });
        return stream.end(cache.body);
      }
      const response = await get(`${originUrl}/asset-a`, { 'x-source-generation': String(grant.generation) });
      if (response.status !== 200) return reject(503);
      // Atomic generation check is local-only; real independent IAM is NOT implemented.
      if (guarded && !authorized()) return reject(403);
      cache = { generation: grant.generation, body: response.body };
      stream.respond({ ':status': 200 });
      stream.end(response.body);
    } catch { reject(503); }
  });
  const gatewayUrl = await listen(gateway);
  return {
    url: (generation = epoch) => `${gatewayUrl}/media/asset-a?grant=${ticket(generation)}`,
    async get(url, extra) { return get(url, extra); },
    arrived: () => arrival,
    releaseOne() { assert.ok(pendingReleases.length); pendingReleases.shift()(); },
    releaseAll() { for (const release of pendingReleases.splice(0)) release(); },
    revoke() { epoch = 2; return { ack: true, epoch }; },
    outage() { authorityAvailable = false; },
    cache: () => cache && { ...cache },
    requests: () => originRequests,
    async close() {
      for (const release of pendingReleases.splice(0)) release();
      await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => origin.close(resolve))]);
    }
  };
}

test('unsafe concurrent stale fill overwrites fresh generation-2 cache AFTER revoke ACK', { timeout: 15000 }, async () => {
  const f = await fixture(false);
  try {
    const old = f.url(1);
    const pending = f.get(old);
    await f.arrived();
    assert.equal(f.revoke().epoch, 2);
    const current = f.url(2);
    assert.deepEqual(await f.get(current), { status: 200, body: 'NEW!' });
    assert.deepEqual(f.cache(), { generation: 2, body: 'NEW!' });
    f.releaseOne();
    assert.deepEqual(await pending, { status: 200, body: 'OLD!' });
    assert.deepEqual(f.cache(), { generation: 1, body: 'OLD!' });
    assert.deepEqual(await f.get(current), { status: 200, body: 'OLD!' });
    assert.equal(f.requests(), 2);
  } finally { await f.close(); }
});

test('guarded concurrent fill rejects stale response and preserves newer cache after ACK', { timeout: 15000 }, async () => {
  const f = await fixture(true);
  try {
    const pending = f.get(f.url(1));
    await f.arrived();
    f.revoke();
    const current = f.url(2);
    assert.deepEqual(await f.get(current), { status: 200, body: 'NEW!' });
    f.releaseOne();
    assert.deepEqual(await pending, { status: 403, body: '' });
    assert.deepEqual(f.cache(), { generation: 2, body: 'NEW!' });
    assert.deepEqual(await f.get(current), { status: 200, body: 'NEW!' });
    assert.equal(f.requests(), 2);
  } finally { await f.close(); }
});

test('guarded TWO stale concurrent fills cannot overwrite generation-2 cache in either release order', { timeout: 15000 }, async () => {
  const f = await fixture(true, 2);
  try {
    const stale = f.url(1);
    const first = f.get(stale);
    const second = f.get(stale);
    await f.arrived();
    f.revoke();
    assert.deepEqual(await f.get(f.url(2)), { status: 200, body: 'NEW!' });
    f.releaseOne();
    assert.deepEqual(await first, { status: 403, body: '' });
    f.releaseOne();
    assert.deepEqual(await second, { status: 403, body: '' });
    assert.deepEqual(f.cache(), { generation: 2, body: 'NEW!' });
    assert.equal(f.requests(), 3);
  } finally { await f.close(); }
});

test('guarded cache hits fail closed on authority outage, duplicate grant and forged signature', { timeout: 15000 }, async () => {
  const f = await fixture(true, 0);
  try {
    f.revoke();
    const current = f.url(2);
    assert.deepEqual(await f.get(current), { status: 200, body: 'NEW!' });
    assert.deepEqual(await f.get(`${current}&grant=${ticket(2)}`), { status: 403, body: '' });
    assert.deepEqual(await f.get(current.slice(0, -1) + (current.endsWith('0') ? '1' : '0')), { status: 403, body: '' });
    f.outage();
    assert.deepEqual(await f.get(current), { status: 403, body: '' });
    assert.equal(f.requests(), 1);
  } finally { await f.close(); }
});
