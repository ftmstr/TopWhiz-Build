import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../../apps/web/app/media/cms/[id]/route.ts';

/** TUR035: actual Next GET and a deterministic fictional upstream stream.
 * This is NEGATIVE evidence, not a Cloudflare/R2 or wire-byte guarantee.
 */
test('TUR035: Next GET response can retain bytes across revoke; cancellation is local', async () => {
  const oldFetch = globalThis.fetch;
  const oldBase = process.env.TOPWHIZ_CMS_API_BASE;
  const oldHost = process.env.TOPWHIZ_CMS_API_HOST;
  const id = 'tur035-fictional-stream';
  let approved = true;
  let upstreamCalls = 0;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const before = new Uint8Array(16).fill(17);
  const after = new Uint8Array(16).fill(29);
  try {
    process.env.TOPWHIZ_CMS_API_BASE = 'https://cms.ci.invalid/';
    process.env.TOPWHIZ_CMS_API_HOST = 'cms.ci.invalid';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), 'https://cms.ci.invalid/v1/media/' + id);
      assert.equal(init?.method, 'GET');
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.redirect, 'error');
      upstreamCalls++;
      if (!approved) return new Response(null, { status: 404 });
      const body = new ReadableStream<Uint8Array>({
        start(c) { controller = c; },
        cancel() { cancelled = true; }
      });
      return new Response(body, { headers: {
        'content-type': 'image/png', 'content-length': '32'
      }});
    }) as typeof fetch;
    const route = () => GET(new Request('http://localhost/media/cms/' + id) as any,
      { params: Promise.resolve({ id }) });
    const response = await route();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const reader = response.body!.getReader();
    controller.enqueue(before);
    const first = await reader.read();
    assert.deepEqual(first.value, before);
    // Simulate durable rights withdrawal AFTER the proxy constructed its Response.
    approved = false;
    controller.enqueue(after);
    controller.close();
    const second = await reader.read();
    assert.deepEqual(second.value, after, 'existing stream retains fictional post-revoke bytes');
    assert.equal((await reader.read()).done, true);
    assert.equal((await route()).status, 404, 'fresh request is denied');
    assert.equal(upstreamCalls, 2);
    assert.equal(cancelled, false);

    // A second admitted stream is cancelled locally; no remote or CDN rollback claim.
    approved = true;
    const abortable = await route();
    assert.equal(abortable.status, 200);
    const localReader = abortable.body!.getReader();
    await localReader.cancel('local receiver abort');
    assert.equal(cancelled, true);
    approved = false;
    assert.equal((await route()).status, 404);
    console.log(JSON.stringify({
      suite: 'TUR035_ACTUAL_NEXT_STREAM_REVOKE_NEGATIVE',
      actualNextGet: true, fictionalPostRevokeBytes: after.length,
      freshDenied: true, localCancelObserved: true,
      realPg16: 'NOT_RUN_IN_THIS_TEST', liveR2: 'NOT_RUN',
      globalCdn: 'NOT_RUN', lastWireByte: 'NOT_PROVEN',
      tur018FictionalUnsafeBytes: 99276, release: 'NO_GO'
    }));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldBase === undefined) delete process.env.TOPWHIZ_CMS_API_BASE;
    else process.env.TOPWHIZ_CMS_API_BASE = oldBase;
    if (oldHost === undefined) delete process.env.TOPWHIZ_CMS_API_HOST;
    else process.env.TOPWHIZ_CMS_API_HOST = oldHost;
  }
});
