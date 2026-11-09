import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../../apps/web/app/media/cms/[id]/route.ts';

/** Actual Next GET proxy, synthetic upstream only. No live network, R2 or CDN. */
test('TUR036: malformed upstream and request headers fail closed without cacheable responses', async () => {
  const oldFetch = globalThis.fetch;
  const oldBase = process.env.TOPWHIZ_CMS_API_BASE;
  const oldHost = process.env.TOPWHIZ_CMS_API_HOST;
  const id = 'tur036-fictional';
  let calls = 0;
  let cancels = 0;
  let mode: 'ok'|'mime'|'length'|'large'|'missing'|'denied' = 'ok';
  try {
    process.env.TOPWHIZ_CMS_API_BASE = 'https://cms.ci.invalid/';
    process.env.TOPWHIZ_CMS_API_HOST = 'cms.ci.invalid';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      assert.equal(String(input), 'https://cms.ci.invalid/v1/media/' + id);
      assert.equal(init?.method, 'GET');
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('range'), null);
      assert.equal(new Headers(init?.headers).get('if-none-match'), null);
      assert.equal(new Headers(init?.headers).get('if-range'), null);
      assert.equal(new Headers(init?.headers).get('if-modified-since'), null);
      if (mode === 'denied') return new Response(null, {status:404});
      const stream = new ReadableStream<Uint8Array>({cancel(){cancels++;}});
      const headers: Record<string,string> = {
        'content-type': mode === 'mime' ? 'text/html' : 'image/png',
        'content-length': mode === 'length' ? 'NaN' : mode === 'large' ? '10485761' : '32'
      };
      if (mode === 'missing') delete headers['content-length'];
      return new Response(stream,{status:200,headers});
    }) as typeof fetch;
    const route = (key=id) => GET(new Request('http://localhost/media/cms/'+key,{
      headers: {'Range':'bytes=0-3','If-Range':'"stale"','If-None-Match':'"stale"',
        'If-Modified-Since':'Mon, 01 Jan 2024 00:00:00 GMT'}
    }) as any,{params:Promise.resolve({id:key})});
    for (const key of ['../secret','INVALID','a'.repeat(97),'bad%2fid']) {
      const before=calls;
      const response=await route(key);
      assert.equal(response.status,404);
      assert.equal(calls,before,'invalid IDs must not fetch upstream');
      assert.equal(response.headers.get('cache-control'),'no-store');
    }
    for (const invalid of ['mime','length','large','missing'] as const) {
      mode=invalid;
      const response=await route();
      assert.equal(response.status,503,invalid);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.equal(response.body,null);
    }
    assert.equal(cancels,4,'invalid upstream streams must be cancelled');
    mode='denied';
    const denied=await route();
    assert.equal(denied.status,404);
    assert.equal(denied.headers.get('cache-control'),'no-store');
    mode='ok';
    const ok=await route();
    assert.equal(ok.status,200);
    assert.equal(ok.headers.get('cache-control'),'no-store');
    assert.equal(ok.headers.get('content-length'),'32');
    assert.equal(ok.headers.get('content-security-policy'),"default-src 'none'; sandbox");
    await ok.body!.cancel();
    console.log(JSON.stringify({suite:'TUR036_ACTUAL_NEXT_FAILCLOSED',
      invalidIds:4,invalidUpstream:4,upstreamDenied:true,
      conditionalHeadersNotForwarded:true,liveR2:'NOT_RUN',
      globalLastWireByte:'NOT_PROVEN',issue22:'OPEN',release:'NO_GO'}));
  } finally {
    globalThis.fetch=oldFetch;
    if(oldBase===undefined)delete process.env.TOPWHIZ_CMS_API_BASE;
    else process.env.TOPWHIZ_CMS_API_BASE=oldBase;
    if(oldHost===undefined)delete process.env.TOPWHIZ_CMS_API_HOST;
    else process.env.TOPWHIZ_CMS_API_HOST=oldHost;
  }
});
