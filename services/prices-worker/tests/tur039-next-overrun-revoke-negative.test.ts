import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../../apps/web/app/media/cms/[id]/route.ts';

/** Negative evidence only: headers and a one-time authorization cannot fence later bytes. */
test('TUR039 actual Next GET permits advertised-length overrun after simulated revoke', async () => {
  const previousFetch=globalThis.fetch;
  const previousBase=process.env.TOPWHIZ_CMS_API_BASE;
  const previousHost=process.env.TOPWHIZ_CMS_API_HOST;
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let revoked=false;
  let upstreamCalls=0;
  try {
    process.env.TOPWHIZ_CMS_API_BASE='https://cms.ci.invalid/';
    process.env.TOPWHIZ_CMS_API_HOST='cms.ci.invalid';
    globalThis.fetch=(async()=>{
      upstreamCalls++;
      if(revoked)return new Response(null,{status:403});
      return new Response(new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new Uint8Array(12).fill(65));
          await gate;
          controller.enqueue(new Uint8Array(8).fill(66));
          controller.close();
        }
      }),{status:200,headers:{'content-type':'image/png','content-length':'12'}});
    }) as typeof fetch;
    const request=()=>GET(new Request('http://localhost/media/cms/fictional-media') as any,
      {params:Promise.resolve({id:'fictional-media'})});
    const pending=request();
    // The upstream stream may wait on gate; release it only after GET headers resolve.
    // A real DB COMMIT, R2/CDN, or network recipient is deliberately not modeled.
    // Queue a microtask to allow upstream response construction to proceed.
    await Promise.resolve();
    revoked=true;
    release();
    const response=await pending;
    assert.equal(response.status,200,'negative: pre-revoke admission survives later revoke');
    assert.equal(response.headers.get('content-length'),'12');
    const bytes=new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes.length,20,'negative: body can exceed declared Content-Length');
    assert.equal(bytes.slice(12).every(v=>v===66),true);
    const denied=await request();
    assert.equal(denied.status,503,'new request denied after simulated revoke');
    assert.equal(denied.headers.get('cache-control'),'no-store');
    assert.equal(upstreamCalls,2);
    console.log(JSON.stringify({suite:'TUR039_NEXT_OVERRUN_REVOKE_NEGATIVE',
      declaredBytes:12,deliveredBytes:20,postRevokeBufferedBytes:8,
      laterRequest:denied.status,realDBCommit:'NOT_RUN',globalLastByte:'NOT_PROVEN',
      issue22:'OPEN',release:'NO_GO'}));
  } finally {
    release?.();
    globalThis.fetch=previousFetch;
    if(previousBase===undefined)delete process.env.TOPWHIZ_CMS_API_BASE;
    else process.env.TOPWHIZ_CMS_API_BASE=previousBase;
    if(previousHost===undefined)delete process.env.TOPWHIZ_CMS_API_HOST;
    else process.env.TOPWHIZ_CMS_API_HOST=previousHost;
  }
});
