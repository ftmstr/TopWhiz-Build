import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';

// TUR119: fictional, local-only HTTP/2 304; no production media or credentials.
const { HTTP2_HEADER_STATUS: STATUS, HTTP2_HEADER_PATH: PATH,
  HTTP2_HEADER_METHOD: METHOD } = http2.constants;

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return 'http://127.0.0.1:' + server.address().port;
}
async function request(url, path, method = 'GET', headers = {}) {
  const session = http2.connect(url);
  // An intentionally unavailable authority must not crash the test runner.
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
        etag: responseHeaders?.etag,
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

test('real HTTP/2 held 304 after rights revoke ACK must not resurrect cached bytes',
  { timeout: 30000 }, async () => {
    let generation = 1;
    let approved = true;
    let entered = 0;
    let notifyEntered;
    const bothEntered = new Promise(resolve => { notifyEntered = resolve; });
    let releaseHeld;
    const held = new Promise(resolve => { releaseHeld = resolve; });
    let unsafeReused304 = 0;
    let safeRejectedAfter304 = 0;
    let origin304 = 0;
    const authority = http2.createServer();
    const origin = http2.createServer();
    const gateway = http2.createServer();
    let authorityUrl, originUrl, gatewayUrl;
    const cache = new Map();
    authority.on('stream', (stream, headers) => {
      const path = headers[PATH];
      if (path === '/revoke' && headers[METHOD] === 'POST') {
        generation++;
        approved = false;
        stream.respond({ [STATUS]: 200, 'content-type': 'application/json' });
        stream.end(JSON.stringify({ ack: true, generation, approved }));
      } else if (path === '/rights') {
        stream.respond({ [STATUS]: 200, 'content-type': 'application/json' });
        stream.end(JSON.stringify({ generation, approved }));
      } else { stream.respond({ [STATUS]: 404 }); stream.end(); }
    });
    origin.on('stream', (stream, headers) => {
      (async () => {
        if (headers[PATH] !== '/asset?hold=1' && headers[PATH] !== '/asset') {
          stream.respond({ [STATUS]: 404 }); stream.end(); return;
        }
        if (headers['if-none-match'] === '"fictional-content-v1"') {
          if (headers[PATH] === '/asset?hold=1') {
            entered++;
            if (entered === 2) notifyEntered();
            await held;
          }
          origin304++;
          // Origin revalidates content ETag only, not media publication rights.
          stream.respond({ [STATUS]: 304, etag: '"fictional-content-v1"' });
          stream.end();
        } else {
          stream.respond({ [STATUS]: 200, etag: '"fictional-content-v1"' });
          stream.end('OLD!');
        }
      })().catch(error => stream.destroy(error));
    });
    async function rights() {
      try {
        const r = await request(authorityUrl, '/rights');
        if (r.status !== 200) return null;
        const state = JSON.parse(r.body);
        if (typeof state.generation !== 'number' ||
            typeof state.approved !== 'boolean') return null;
        return state;
      } catch { return null; }
    }
    gateway.on('stream', (stream, headers) => {
      (async () => {
        const route = headers[PATH];
        const mode = route?.startsWith('/safe') ? 'safe' :
          route?.startsWith('/unsafe') ? 'unsafe' : null;
        if (!mode) { stream.respond({ [STATUS]: 404 }); stream.end(); return; }
        const initialRights = mode === 'safe' ? await rights() : null;
        if (mode === 'safe' && (!initialRights || !initialRights.approved)) {
          stream.respond({ [STATUS]: 403, 'cache-control': 'no-store' });
          stream.end(); return;
        }
        const cached = cache.get(mode);
        const conditional = cached ? { 'if-none-match': cached.etag } : {};
        const hold = route.endsWith('hold=1') ? '?hold=1' : '';
        const result = await request(originUrl, '/asset' + hold, 'GET', conditional);
        if (mode === 'safe') {
          // Recheck AFTER held 304 and BEFORE cached body delivery.
          const latest = await rights();
          if (!latest || !latest.approved ||
              latest.generation !== initialRights.generation) {
            if (result.status === 304) safeRejectedAfter304++;
            stream.respond({ [STATUS]: 403, 'cache-control': 'no-store' });
            stream.end(); return;
          }
        }
        if (result.status === 304 && cached) {
          if (mode === 'unsafe') unsafeReused304++;
          stream.respond({ [STATUS]: 200, 'cache-control': 'no-store' });
          stream.end(cached.body); return;
        }
        if (result.status !== 200) {
          stream.respond({ [STATUS]: 502 }); stream.end(); return;
        }
        cache.set(mode, { etag: result.etag, body: result.body });
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
      assert.deepEqual(await request(gatewayUrl, '/unsafe'),
        { status: 200, etag: undefined, body: 'OLD!' });
      assert.deepEqual(await request(gatewayUrl, '/safe'),
        { status: 200, etag: undefined, body: 'OLD!' });
      const unsafePending = request(gatewayUrl, '/unsafe?hold=1');
      const safePending = request(gatewayUrl, '/safe?hold=1');
      await bothEntered;
      const revoke = await request(authorityUrl, '/revoke', 'POST');
      assert.equal(revoke.status, 200);
      assert.deepEqual(JSON.parse(revoke.body),
        { ack: true, generation: 2, approved: false });
      releaseHeld();
      const [unsafeResult, safeResult] = await Promise.all([unsafePending, safePending]);
      assert.deepEqual(unsafeResult, { status: 200, etag: undefined, body: 'OLD!' });
      assert.deepEqual(safeResult, { status: 403, etag: undefined, body: '' });
      assert.equal(origin304, 2);
      assert.equal(unsafeReused304, 1);
      assert.equal(safeRejectedAfter304, 1);
      assert.deepEqual(await request(gatewayUrl, '/safe'),
        { status: 403, etag: undefined, body: '' });
      await close(authority);
      assert.deepEqual(await request(gatewayUrl, '/safe'),
        { status: 403, etag: undefined, body: '' });
      console.log(JSON.stringify({ suite: 'TUR119_HTTP2_HELD_304_POST_REVOKE_ACK',
        realLocalHttp2: true, contentOnly304: 2, revokedGeneration: 2,
        unsafePostAckBytes: 4, safePostAckBytes: 0,
        safe403AfterHeld304: true, safe403WhenAuthorityDown: true,
        productionCdnLastByte: 'NOT_PROVEN', issue22: 'OPEN', release: 'NO_GO' }));
    } finally {
      releaseHeld();
      await Promise.allSettled([close(gateway), close(origin),
        ...(authority.listening ? [close(authority)] : [])]);
    }
  });
