import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';

// TUR122: disposable localhost HTTP/2 only. Deliberately unsafe shared
// single-flight promises are adversarial fixtures, NOT production behavior.
const { HTTP2_HEADER_STATUS: STATUS, HTTP2_HEADER_PATH: PATH,
  HTTP2_HEADER_METHOD: METHOD } = http2.constants;
const OLD_ETAG = '"identical-content-etag"';

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
      stream.on('data', b => chunks.push(b));
      stream.on('end', () => resolve({ status: responseHeaders?.[STATUS],
        body: Buffer.concat(chunks).toString('utf8') }));
      stream.on('error', reject);
      stream.end();
    });
  } finally { session.close(); }
}
async function close(server) {
  if (!server.listening) return;
  await new Promise(resolve => server.close(resolve));
}

test('cross-tenant single-flight joins held 304 after revoke ACK; scoped fence rejects it',
  { timeout: 30000 }, async () => {
    const state = { A: { generation: 1, approved: true },
      B: { generation: 1, approved: true } };
    const authority = http2.createServer();
    const origin = http2.createServer();
    const gateway = http2.createServer();
    let authorityUrl, originUrl, gatewayUrl;
    const unsafeCache = new Map();
    const safeL1 = new Map(), safeL2 = new Map();
    const unsafeInflight = new Map(), safeInflight = new Map();
    let heldOriginCount = 0, originRequests = 0, unsafeCrossTenantJoins = 0;
    let releaseHeld;
    const held = new Promise(resolve => { releaseHeld = resolve; });
    let signalReady;
    const ready = new Promise(resolve => { signalReady = resolve; });
    let signalJoined;
    const joined = new Promise(resolve => { signalJoined = resolve; });

    authority.on('stream', (stream, headers) => {
      if (headers[PATH] === '/transition' && headers[METHOD] === 'POST') {
        state.A = { generation: 2, approved: false };
        state.B = { generation: 2, approved: true };
        stream.respond({ [STATUS]: 200 });
        stream.end(JSON.stringify({ ack: true, A: state.A, B: state.B }));
      } else if (/^\/rights\/[AB]$/.test(headers[PATH])) {
        const tenant = headers[PATH].at(-1);
        stream.respond({ [STATUS]: 200 });
        stream.end(JSON.stringify({ tenant, ...state[tenant] }));
      } else { stream.respond({ [STATUS]: 404 }); stream.end(); }
    });
    origin.on('stream', (stream, headers) => {
      (async () => {
        originRequests++;
        const url = new URL(headers[PATH], 'http://local');
        const tenant = url.pathname === '/A/item' ? 'A' :
          url.pathname === '/B/item' ? 'B' : null;
        if (!tenant) { stream.respond({ [STATUS]: 404 }); stream.end(); return; }
        if (tenant === 'A' && headers['if-none-match'] === OLD_ETAG) {
          heldOriginCount++;
          if (heldOriginCount === 2) signalReady();
          await held;
          stream.respond({ [STATUS]: 304, etag: OLD_ETAG });
          stream.end();
          return;
        }
        stream.respond({ [STATUS]: 200, etag: '"B-new-generation"' });
        stream.end(tenant === 'B' ? 'BNEW' : 'AOLD');
      })().catch(e => stream.destroy(e));
    });
    async function rights(tenant) {
      try {
        const response = await request(authorityUrl, '/rights/' + tenant);
        if (response.status !== 200) return null;
        const r = JSON.parse(response.body);
        return r.tenant === tenant && Number.isSafeInteger(r.generation) &&
          typeof r.approved === 'boolean' ? r : null;
      } catch { return null; }
    }
    const scopedKey = (tenant, generation) =>
      tenant + '/item/rights:' + generation;
    gateway.on('stream', (stream, headers) => {
      (async () => {
        const url = new URL(headers[PATH], 'http://local');
        const match = /^\/(safe|unsafe)\/(A|B)\/item$/.exec(url.pathname);
        if (!match) { stream.respond({ [STATUS]: 404 }); stream.end(); return; }
        const [, mode, tenant] = match;
        const safe = mode === 'safe';
        const deny = () => {
          stream.respond({ [STATUS]: 403, 'cache-control': 'no-store' });
          stream.end();
        };
        const initial = safe ? await rights(tenant) : null;
        if (safe && (!initial || !initial.approved)) { deny(); return; }
        const key = safe ? scopedKey(tenant, initial.generation) : OLD_ETAG;
        const l1 = safe ? safeL1 : unsafeCache;
        const l2 = safe ? safeL2 : unsafeCache;
        if (url.searchParams.has('prime')) {
          const entry = { tenant, etag: OLD_ETAG,
            body: tenant === 'A' ? 'AOLD' : 'BOLD' };
          l1.set(key, entry);
          l2.set(key, entry);
          stream.respond({ [STATUS]: 200 }); stream.end(entry.body); return;
        }
        const cached = l2.get(key);
        if (url.searchParams.has('cached') && l1.has(key)) {
          const latest = safe ? await rights(tenant) : null;
          if (safe && (!latest || !latest.approved ||
              latest.generation !== initial.generation)) { deny(); return; }
          stream.respond({ [STATUS]: 200 }); stream.end(l1.get(key).body); return;
        }
        const inflight = safe ? safeInflight : unsafeInflight;
        let pending = inflight.get(key);
        if (!pending) {
          pending = request(originUrl, '/' + tenant + '/item', 'GET',
            cached ? { 'if-none-match': cached.etag } : {});
          inflight.set(key, pending);
          void pending.finally(() => {
            if (inflight.get(key) === pending) inflight.delete(key);
          }).catch(() => {});
        } else if (!safe && tenant === 'B') {
          unsafeCrossTenantJoins++;
          signalJoined();
        }
        const response = await pending;
        // Recheck after every async source/304/coalesced promise boundary.
        if (safe) {
          const latest = await rights(tenant);
          if (!latest || !latest.approved ||
              latest.generation !== initial.generation) { deny(); return; }
        }
        const body = response.status === 304 && cached ? cached.body :
          response.status === 200 ? response.body : null;
        if (body === null) {
          stream.respond({ [STATUS]: 502 }); stream.end(); return;
        }
        const entry = { tenant, body, etag: response.status === 304 ?
          cached.etag : '"B-new-generation"' };
        l2.set(key, entry); l1.set(key, entry);
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
      assert.deepEqual(await request(gatewayUrl, '/unsafe/A/item?prime=1'),
        { status: 200, body: 'AOLD' });
      assert.deepEqual(await request(gatewayUrl, '/safe/A/item?prime=1'),
        { status: 200, body: 'AOLD' });
      const unsafeA = request(gatewayUrl, '/unsafe/A/item');
      const safeA = request(gatewayUrl, '/safe/A/item');
      await ready; // Both A revalidations are held at the origin.
      const ack = await request(authorityUrl, '/transition', 'POST');
      assert.deepEqual(JSON.parse(ack.body), { ack: true,
        A: { generation: 2, approved: false },
        B: { generation: 2, approved: true } });
      const unsafeB = request(gatewayUrl, '/unsafe/B/item');
      await joined; // B joins A's old promise strictly AFTER revocation ACK.
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item'),
        { status: 200, body: 'BNEW' });
      releaseHeld();
      assert.deepEqual(await unsafeA, { status: 200, body: 'AOLD' });
      assert.deepEqual(await unsafeB, { status: 200, body: 'AOLD' });
      assert.deepEqual(await safeA, { status: 403, body: '' });
      assert.deepEqual(await request(gatewayUrl, '/safe/A/item?cached=1'),
        { status: 403, body: '' });
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item?cached=1'),
        { status: 200, body: 'BNEW' });
      assert.equal(unsafeCrossTenantJoins, 1);
      assert.equal(heldOriginCount, 2);
      assert.equal(originRequests, 3); // B unsafe made no own origin call.
      await close(authority);
      assert.deepEqual(await request(gatewayUrl, '/safe/B/item?cached=1'),
        { status: 403, body: '' });
      console.log(JSON.stringify({
        suite: 'TUR122_HTTP2_SINGLEFLIGHT_304_TENANT_FENCE',
        localHttp2: true, postAckUnsafeWrongTenantBytes: 4,
        postAckUnsafeTotalStaleBytes: 8, guardedWrongTenantBytes: 0,
        unsafeCrossTenantInflightJoins: unsafeCrossTenantJoins,
        safeStale304Denied: true, safeNewGeneration: 'BNEW',
        authorityOutageFailClosed: true, issue22: 'OPEN',
        remoteFinalReceiverByte: 'NOT_PROVEN', release: 'NO_GO',
      }));
    } finally {
      releaseHeld();
      await Promise.allSettled([close(gateway), close(origin), close(authority)]);
    }
  });
