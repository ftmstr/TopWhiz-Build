import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';

// TUR120: local-only, fictional media. The vulnerable model is intentional.
const { HTTP2_HEADER_STATUS: STATUS, HTTP2_HEADER_PATH: PATH,
  HTTP2_HEADER_METHOD: METHOD } = http2.constants;
const ETAG = '"shared-content-only-etag"';
const bodies = { 'A/item': 'AOLD', 'B/item': 'BNEW', 'B/alt': 'BALT' };

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return 'http://127.0.0.1:' + server.address().port;
}
async function request(url, path, method = 'GET', headers = {}) {
  const session = http2.connect(url);
  session.on('error', () => {});
  try {
    return await new Promise((resolve, reject) => {
      let responseHeaders;
      const chunks = [];
      const stream = session.request({ [PATH]: path, [METHOD]: method, ...headers });
      stream.on('response', h => { responseHeaders = h; });
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve({
        status: responseHeaders?.[STATUS],
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      stream.on('error', reject);
      stream.end();
    });
  } finally { session.close(); }
}
async function close(server) {
  await new Promise(resolve => server.close(resolve));
}

test('HTTP2 304 shared ETag must not alias tenants/assets after revoke ACK',
  { timeout: 30000 }, async () => {
    const grants = { A: { generation: 1, approved: true },
      B: { generation: 1, approved: true } };
    let entered = 0;
    let enteredResolve;
    const bothEntered = new Promise(resolve => { enteredResolve = resolve; });
    let releaseHeld;
    const held = new Promise(resolve => { releaseHeld = resolve; });
    let origin304 = 0;
    let unsafeCrossTenant304 = 0;
    let safeScoped304 = 0;
    const unsafeCache = new Map();
    const safeCache = new Map();
    const authority = http2.createServer();
    const origin = http2.createServer();
    const gateway = http2.createServer();
    let authorityUrl, originUrl, gatewayUrl;

    authority.on('stream', (stream, headers) => {
      const path = headers[PATH];
      if (path === '/revoke/A' && headers[METHOD] === 'POST') {
        grants.A = { generation: 2, approved: false };
        stream.respond({ [STATUS]: 200 });
        stream.end(JSON.stringify({ tenant: 'A', ...grants.A, ack: true }));
      } else if (path === '/rights/A' || path === '/rights/B') {
        const tenant = path.slice(-1);
        stream.respond({ [STATUS]: 200 });
        stream.end(JSON.stringify({ tenant, ...grants[tenant] }));
      } else { stream.respond({ [STATUS]: 404 }); stream.end(); }
    });

    origin.on('stream', (stream, headers) => {
      (async () => {
        const url = new URL(headers[PATH], 'http://local');
        const key = url.pathname.slice(1);
        if (!Object.hasOwn(bodies, key)) {
          stream.respond({ [STATUS]: 404 }); stream.end(); return;
        }
        if (headers['if-none-match'] === ETAG) {
          if (url.searchParams.has('hold')) {
            entered++;
            if (entered === 2) enteredResolve();
            await held;
          }
          origin304++;
          // A shared content ETag is not a tenant/asset publication grant.
          stream.respond({ [STATUS]: 304, etag: ETAG });
          stream.end();
        } else {
          stream.respond({ [STATUS]: 200, etag: ETAG });
          stream.end(bodies[key]);
        }
      })().catch(error => stream.destroy(error));
    });

    async function rights(tenant) {
      try {
        const r = await request(authorityUrl, '/rights/' + tenant);
        if (r.status !== 200) return null;
        const state = JSON.parse(r.body);
        if (state.tenant !== tenant ||
            !Number.isSafeInteger(state.generation) ||
            typeof state.approved !== 'boolean') return null;
        return state;
      } catch { return null; }
    }

    gateway.on('stream', (stream, headers) => {
      (async () => {
        const url = new URL(headers[PATH], 'http://local');
        const match = /^\/(unsafe|safe)\/(A|B)\/(item|alt)$/.exec(url.pathname);
        if (!match) { stream.respond({ [STATUS]: 404 }); stream.end(); return; }
        const [, mode, tenant, asset] = match;
        const initial = mode === 'safe' ? await rights(tenant) : null;
        if (mode === 'safe' && (!initial || !initial.approved)) {
          stream.respond({ [STATUS]: 403, 'cache-control': 'no-store' });
          stream.end(); return;
        }
        const scopedKey = tenant + '/' + asset + '/' + initial?.generation;
        const cacheKey = mode === 'safe' ? scopedKey : 'shared-etag';
        const cache = mode === 'safe' ? safeCache : unsafeCache;
        const cached = cache.get(cacheKey);
        const conditional = cached ? { 'if-none-match': cached.etag } : {};
        const originPath = '/' + tenant + '/' + asset +
          (url.searchParams.has('hold') ? '?hold=1' : '');
        const result = await request(originUrl, originPath, 'GET', conditional);
        if (mode === 'safe') {
          const latest = await rights(tenant);
          if (!latest || !latest.approved ||
              latest.generation !== initial.generation) {
            stream.respond({ [STATUS]: 403, 'cache-control': 'no-store' });
            stream.end(); return;
          }
        }
        if (result.status === 304 && cached) {
          if (mode === 'unsafe' && tenant === 'B') unsafeCrossTenant304++;
          if (mode === 'safe') safeScoped304++;
          stream.respond({ [STATUS]: 200, 'cache-control': 'no-store' });
          stream.end(cached.body); return;
        }
        if (result.status !== 200) {
          stream.respond({ [STATUS]: 502 }); stream.end(); return;
        }
        cache.set(cacheKey, { etag: ETAG, body: result.body });
        stream.respond({ [STATUS]: 200, 'cache-control': 'no-store' });
        stream.end(result.body);
      })().catch(() => {
        if (!stream.destroyed) {
          try { stream.respond({ [STATUS]: 503 }); stream.end(); }
          catch { stream.close(); }
        }
      });
    });

    try {
      authorityUrl = await listen(authority);
      originUrl = await listen(origin);
      gatewayUrl = await listen(gateway);
      assert.deepEqual(await request(gatewayUrl, '/unsafe/A/item'),
        { status: 200, body: 'AOLD' });
      assert.deepEqual(await request(gatewayUrl, '/safe/A/item'),
        { status: 200, body: 'AOLD' });

      const unsafeBItem = request(gatewayUrl, '/unsafe/B/item?hold=1');
      const unsafeBAlt = request(gatewayUrl, '/unsafe/B/alt?hold=1');
      await bothEntered;
      const ack = await request(authorityUrl, '/revoke/A', 'POST');
      assert.equal(ack.status, 200);
      assert.deepEqual(JSON.parse(ack.body),
        { tenant: 'A', generation: 2, approved: false, ack: true });
      releaseHeld();

      const [itemLeak, altLeak] = await Promise.all([unsafeBItem, unsafeBAlt]);
      assert.deepEqual(itemLeak, { status: 200, body: 'AOLD' });
      assert.deepEqual(altLeak, { status: 200, body: 'AOLD' });
      assert.equal(unsafeCrossTenant304, 2);

      assert.deepEqual(await request(gatewayUrl, '/safe/A/item'),
        { status: 403, body: '' });
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item'),
        { status: 200, body: 'BNEW' });
      assert.deepEqual(await request(gatewayUrl, '/safe/B/alt'),
        { status: 200, body: 'BALT' });
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item'),
        { status: 200, body: 'BNEW' });
      assert.equal(safeScoped304, 1);
      assert.equal(origin304, 3);

      await close(authority);
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item'),
        { status: 403, body: '' });
      console.log(JSON.stringify({
        suite: 'TUR120_HTTP2_CROSS_TENANT_304_POST_ACK',
        realLocalHttp2: true, sharedContentEtag: true,
        held304AfterRevokeAck: 2, unsafeWrongTenantPostAckBytes: 8,
        guardedWrongTenantPostAckBytes: 0, guardedTenantBItem: 'BNEW',
        guardedTenantBAlt: 'BALT', safeScoped304,
        authorityOutageFailClosed: true, issue22: 'OPEN',
        remoteReceiverLastByte: 'NOT_PROVEN', release: 'NO_GO',
      }));
    } finally {
      releaseHeld();
      await Promise.allSettled([close(gateway), close(origin),
        ...(authority.listening ? [close(authority)] : [])]);
    }
  });
