import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';

// TUR121: localhost HTTP/2 only; fictional media; unsafe L1/L2 intentionally leaks.
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


test('two cache layers cannot resurrect a stale 304 after simultaneous ETag and grant epoch transition',
  { timeout: 30000 }, async () => {
    const rightsState = { A: { generation: 1, approved: true },
      B: { generation: 1, approved: true } };
    let epoch = 1;
    let entered = 0;
    let markEntered;
    const ready = new Promise(resolve => { markEntered = resolve; });
    let releaseHeld;
    const held = new Promise(resolve => { releaseHeld = resolve; });
    const l1Unsafe = new Map(), l2Unsafe = new Map();
    const l1Safe = new Map(), l2Safe = new Map();
    let stale304Count = 0, crossTenantL2 = 0, fenced304 = 0;
    const authority = http2.createServer();
    const origin = http2.createServer();
    const gateway = http2.createServer();
    let authorityUrl, originUrl, gatewayUrl;
    const v1 = '"etag-v1"', v2 = '"etag-v2"';

    authority.on('stream', (stream, headers) => {
      if (headers[PATH] === '/transition' && headers[METHOD] === 'POST') {
        rightsState.A = { generation: 2, approved: false };
        rightsState.B = { generation: 2, approved: true };
        epoch = 2;
        stream.respond({ [STATUS]: 200 });
        stream.end(JSON.stringify({ ack: true, A: rightsState.A, B: rightsState.B }));
      } else if (/^\/rights\/[AB]$/.test(headers[PATH])) {
        const tenant = headers[PATH].at(-1);
        stream.respond({ [STATUS]: 200 });
        stream.end(JSON.stringify({ tenant, ...rightsState[tenant] }));
      } else { stream.respond({ [STATUS]: 404 }); stream.end(); }
    });
    origin.on('stream', (stream, headers) => {
      (async () => {
        const url = new URL(headers[PATH], 'http://local');
        const tenant = url.pathname === '/A/item' ? 'A' :
          url.pathname === '/B/item' ? 'B' : null;
        if (!tenant) { stream.respond({ [STATUS]: 404 }); stream.end(); return; }
        const snapshot = epoch;
        const etag = snapshot === 1 ? v1 : v2;
        const body = tenant === 'A' ? 'AOLD' : snapshot === 1 ? 'BOLD' : 'BNEW';
        if (headers['if-none-match'] === etag) {
          if (url.searchParams.has('hold')) {
            entered++;
            if (entered === 2) markEntered();
            await held;
          }
          stale304Count++;
          stream.respond({ [STATUS]: 304, etag });
          stream.end();
        } else {
          stream.respond({ [STATUS]: 200, etag });
          stream.end(body);
        }
      })().catch(error => stream.destroy(error));
    });
    async function rights(tenant) {
      try {
        const r = await request(authorityUrl, '/rights/' + tenant);
        if (r.status !== 200) return null;
        const state = JSON.parse(r.body);
        return state.tenant === tenant && Number.isSafeInteger(state.generation) &&
          typeof state.approved === 'boolean' ? state : null;
      } catch { return null; }
    }
    gateway.on('stream', (stream, headers) => {
      (async () => {
        const url = new URL(headers[PATH], 'http://local');
        const match = /^\/(safe|unsafe)\/(A|B)\/item$/.exec(url.pathname);
        if (!match) { stream.respond({ [STATUS]: 404 }); stream.end(); return; }
        const [, mode, tenant] = match;
        const safe = mode === 'safe';
        const initial = safe ? await rights(tenant) : null;
        const deny = () => {
          stream.respond({ [STATUS]: 403, 'cache-control': 'no-store' });
          stream.end();
        };
        if (safe && (!initial || !initial.approved)) { deny(); return; }
        const l1 = safe ? l1Safe : l1Unsafe;
        const l2 = safe ? l2Safe : l2Unsafe;
        const scoped = tenant + '/item/' + initial?.generation;
        const l1Key = safe ? scoped : tenant + '/item';
        const l2Key = safe ? scoped : 'global-etag';
        const local = l1.get(l1Key);
        if (url.searchParams.has('cached') && local) {
          if (safe) {
            const latest = await rights(tenant);
            if (!latest || !latest.approved ||
                latest.generation !== initial.generation) { deny(); return; }
          }
          stream.respond({ [STATUS]: 200, 'cache-control': 'no-store' });
          stream.end(local.body); return;
        }
        const cached = l2.get(l2Key);
        if (!safe && tenant === 'B' && cached?.tenant === 'A') crossTenantL2++;
        const path = '/' + tenant + '/item' +
          (url.searchParams.has('hold') ? '?hold=1' : '');
        const result = await request(originUrl, path, 'GET',
          cached ? { 'if-none-match': cached.etag } : {});
        if (safe) {
          const latest = await rights(tenant);
          if (!latest || !latest.approved ||
              latest.generation !== initial.generation) {
            fenced304++; deny(); return;
          }
        }
        let body, etag;
        if (result.status === 304 && cached) {
          body = cached.body;
          etag = cached.etag;
        } else if (result.status === 200) {
          body = result.body;
          etag = epoch === 1 ? v1 : v2;
        } else {
          stream.respond({ [STATUS]: 502 }); stream.end(); return;
        }
        const entry = { tenant, body, etag };
        l2.set(l2Key, entry);
        l1.set(l1Key, entry);
        stream.respond({ [STATUS]: 200, 'cache-control': 'no-store' });
        stream.end(body);
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
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item'),
        { status: 200, body: 'BOLD' });
      const unsafePending = request(gatewayUrl, '/unsafe/B/item?hold=1');
      const safePending = request(gatewayUrl, '/safe/B/item?hold=1');
      await ready;
      const ack = await request(authorityUrl, '/transition', 'POST');
      assert.equal(ack.status, 200);
      assert.deepEqual(JSON.parse(ack.body),
        { ack: true, A: { generation: 2, approved: false },
          B: { generation: 2, approved: true } });
      releaseHeld();
      assert.deepEqual(await unsafePending, { status: 200, body: 'AOLD' });
      assert.deepEqual(await safePending, { status: 403, body: '' });
      assert.deepEqual(await request(gatewayUrl, '/unsafe/B/item?cached=1'),
        { status: 200, body: 'AOLD' });
      assert.deepEqual(await request(gatewayUrl, '/safe/A/item'),
        { status: 403, body: '' });
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item?cached=1'),
        { status: 200, body: 'BNEW' });
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item'),
        { status: 200, body: 'BNEW' });
      assert.equal(stale304Count, 3);
      assert.equal(crossTenantL2, 1);
      assert.equal(fenced304, 1);
      await close(authority);
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item?cached=1'),
        { status: 403, body: '' });
      console.log(JSON.stringify({
        suite: 'TUR121_HTTP2_MULTILAYER_ETAG_EPOCH',
        localHttp2: true, cacheLayers: 2, held304AfterTransitionAck: 2,
        unsafeWrongTenantBytesPostAck: 8, guardedWrongTenantBytesPostAck: 0,
        guardedStale304Denied: true, newEpochContent: 'BNEW',
        authorityOutageFailClosed: true, issue22: 'OPEN',
        remoteFinalReceiverByte: 'NOT_PROVEN', release: 'NO_GO',
      }));
    } finally {
      releaseHeld();
      await Promise.allSettled([close(gateway), close(origin), close(authority)]);
    }
  });
