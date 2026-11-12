import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Local h2c gateway/origin negative model. NOT real Cloudflare R2/CDN or wire-level proof.
const secret = Buffer.from('topwhiz-tur105-synthetic-only');
const body = Buffer.from('A105TAIL'); // Eight fictional bytes, no actual licensed media.
const etag = '"synthetic-asset-a-v1"';
function ticket(asset, generation) {
  const payload = Buffer.from(JSON.stringify({ asset, generation })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}
function verify(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const received = Buffer.from(parts[1], 'hex');
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return parsed?.asset === 'asset-a' && Number.isSafeInteger(parsed.generation) ? parsed : null;
  } catch { return null; }
}
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function h2get(url, extra = {}) {
  const u = new URL(url);
  const session = http2.connect(u.origin);
  try {
    return await new Promise((resolve, reject) => {
      const stream = session.request({ ':method': 'GET', ':path': u.pathname + u.search, ...extra });
      const chunks = [];
      let headers = {};
      const timeout = setTimeout(() => { stream.close(http2.constants.NGHTTP2_CANCEL); reject(new Error('synthetic h2c timeout')); }, 5000);
      stream.once('response', h => { headers = h; });
      stream.on('data', chunk => chunks.push(chunk));
      stream.once('end', () => { clearTimeout(timeout); resolve({ status: headers[':status'], bytes: Buffer.concat(chunks).toString(), range: headers['content-range'] }); });
      stream.once('error', e => { clearTimeout(timeout); reject(e); });
      stream.end();
    });
  } finally { session.close(); }
}
async function fixture(guarded) {
  let generation = 1;
  let authorityAvailable = true;
  let originFetches = 0;
  let cache = null;
  let holdNext = false;
  let releaseOrigin;
  let signalOrigin;
  let originReached;
  const origin = http2.createServer();
  origin.on('stream', async (stream, headers) => {
    originFetches += 1;
    if (holdNext) {
      holdNext = false;
      signalOrigin();
      await new Promise(resolve => { releaseOrigin = resolve; });
    }
    if (stream.destroyed) return;
    stream.respond({ ':status': 200, etag, 'content-type': 'application/octet-stream' });
    stream.end(body);
  });
  const originUrl = await listen(origin);
  const gateway = http2.createServer();
  gateway.on('stream', async (stream, headers) => {
    const reject = status => { if (!stream.destroyed) { stream.respond({ ':status': status }); stream.end(); } };
    try {
      const u = new URL(headers[':path'], 'http://synthetic.invalid');
      const grants = u.searchParams.getAll('grant');
      const grant = grants.length === 1 ? verify(grants[0]) : null;
      if (u.pathname !== '/media/asset-a' || !grant) return reject(403);
      const isCurrent = () => authorityAvailable && grant.generation === generation;
      if (guarded && !isCurrent()) return reject(403);
      const match = /^bytes=(\d+)-(\d+)$/.exec(headers.range ?? '');
      if (!match) return reject(416);
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end >= body.length) return reject(416);
      if (headers['if-range'] !== undefined && headers['if-range'] !== etag) return reject(403);
      let asset = cache;
      if (asset === null) {
        const fetched = await h2get(`${originUrl}/origin/asset-a`);
        if (fetched.status !== 200 || fetched.bytes !== body.toString()) return reject(503);
        // Critical TOCTOU: check authority AGAIN after asynchronous origin fetch.
        if (guarded && !isCurrent()) return reject(403);
        asset = Buffer.from(fetched.bytes);
        cache = asset;
      }
      if (guarded && !isCurrent()) return reject(403);
      stream.respond({ ':status': 206, 'content-range': `bytes ${start}-${end}/${asset.length}`, etag });
      stream.end(asset.subarray(start, end + 1));
    } catch { reject(503); }
  });
  const gatewayUrl = await listen(gateway);
  return {
    url: () => `${gatewayUrl}/media/asset-a?grant=${ticket('asset-a', generation)}`,
    h2get,
    revoke() { generation += 1; return { ack: true, generation }; },
    outage() { authorityAvailable = false; },
    hold() { holdNext = true; originReached = new Promise(resolve => { signalOrigin = resolve; }); },
    waitOrigin() { return originReached; },
    release() { assert.equal(typeof releaseOrigin, 'function'); releaseOrigin(); },
    fetches() { return originFetches; },
    cached() { return cache !== null; },
    async close() { if (releaseOrigin) releaseOrigin(); await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => origin.close(resolve))]); }
  };
}

test('unsafe h2c cache serves stale 206 Range tail after revoke ACK without origin revalidation', { timeout: 15000 }, async () => {
  const f = await fixture(false);
  try {
    const stale = f.url();
    const first = await f.h2get(stale, { range: 'bytes=0-3', 'if-range': etag });
    assert.deepEqual(first, { status: 206, bytes: 'A105', range: 'bytes 0-3/8' });
    assert.equal(f.revoke().generation, 2);
    const leaked = await f.h2get(stale, { range: 'bytes=4-7', 'if-range': etag });
    assert.deepEqual(leaked, { status: 206, bytes: 'TAIL', range: 'bytes 4-7/8' });
    assert.equal(f.fetches(), 1, 'cache hit bypassed origin after revocation');
  } finally { await f.close(); }
});

test('unsafe delayed origin response can populate cache and emit 206 after revoke ACK', { timeout: 15000 }, async () => {
  const f = await fixture(false);
  try {
    f.hold();
    const pending = f.h2get(f.url(), { range: 'bytes=4-7' });
    await f.waitOrigin();
    assert.equal(f.revoke().generation, 2);
    f.release();
    const leaked = await pending;
    assert.deepEqual(leaked, { status: 206, bytes: 'TAIL', range: 'bytes 4-7/8' });
    assert.equal(f.cached(), true);
  } finally { await f.close(); }
});

test('guarded h2c cache checks epoch on every 206 cache hit and fails closed on outage', { timeout: 15000 }, async () => {
  const f = await fixture(true);
  try {
    const stale = f.url();
    assert.deepEqual(await f.h2get(stale, { range: 'bytes=0-3' }), { status: 206, bytes: 'A105', range: 'bytes 0-3/8' });
    assert.deepEqual(await f.h2get(stale, { range: 'bytes=4-7', 'if-range': etag }), { status: 206, bytes: 'TAIL', range: 'bytes 4-7/8' });
    assert.equal(f.fetches(), 1);
    f.revoke();
    assert.deepEqual(await f.h2get(stale, { range: 'bytes=4-7' }), { status: 403, bytes: '', range: undefined });
    const fresh = f.url();
    f.outage();
    assert.deepEqual(await f.h2get(fresh, { range: 'bytes=4-7' }), { status: 403, bytes: '', range: undefined });
    assert.equal(f.fetches(), 1);
  } finally { await f.close(); }
});

test('guarded delayed fill cannot publish/cache post-ACK; malformed multi-range is denied', { timeout: 15000 }, async () => {
  const f = await fixture(true);
  try {
    assert.deepEqual(await f.h2get(f.url(), { range: 'bytes=0-1,4-5' }), { status: 416, bytes: '', range: undefined });
    assert.equal(f.fetches(), 0);
    f.hold();
    const pending = f.h2get(f.url(), { range: 'bytes=4-7' });
    await f.waitOrigin();
    f.revoke();
    f.release();
    assert.deepEqual(await pending, { status: 403, bytes: '', range: undefined });
    assert.equal(f.cached(), false);
    assert.equal(f.fetches(), 1);
  } finally { await f.close(); }
});
