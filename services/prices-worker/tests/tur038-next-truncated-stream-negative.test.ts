import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../../apps/web/app/media/cms/[id]/route.ts';

/** TUR038: negative evidence: an accepted upstream header does not attest to stream completion. */
test('TUR038 actual Next GET cannot certify declared bytes or post-header stream success', async () => {
  const oldFetch=globalThis.fetch;
  const oldBase=process.env.TOPWHIZ_CMS_API_BASE;
  const oldHost=process.env.TOPWHIZ_CMS_API_HOST;
  const request=()=>GET(new Request('http://localhost/media/cms/fictional-media') as any,
    {params:Promise.resolve({id:'fictional-media'})});
  try {
    process.env.TOPWHIZ_CMS_API_BASE='https://cms.ci.invalid/';
    process.env.TOPWHIZ_CMS_API_HOST='cms.ci.invalid';
    const makeResponse=(body:ReadableStream<Uint8Array>)=>
      new Response(body,{status:200,headers:{'content-type':'image/png','content-length':'12'}});
    globalThis.fetch=(async()=>makeResponse(new ReadableStream({
      start(controller){controller.enqueue(new Uint8Array([137,80,78,71]));controller.close();}
    }))) as typeof fetch;
    const truncated=await request();
    assert.equal(truncated.status,200,'negative evidence: proxy accepts header before verifying EOF');
    assert.equal(truncated.headers.get('content-length'),'12');
    const received=new Uint8Array(await truncated.arrayBuffer());
    assert.equal(received.byteLength,4,'actual received bytes differ from declared 12');
    globalThis.fetch=(async()=>makeResponse(new ReadableStream({
      pull(controller){controller.error(new Error('synthetic-upstream-midstream-failure'));}
    }))) as typeof fetch;
    const failing=await request();
    assert.equal(failing.status,200,'response headers are committed before stream consumption');
    await assert.rejects(()=>failing.arrayBuffer(),/synthetic-upstream-midstream-failure/);
    console.log(JSON.stringify({suite:'TUR038_NEXT_TRUNCATED_STREAM_NEGATIVE',
      declaredBytes:12,receivedBytes:4,midstreamFailure:true,
      headerStatusBeforeFailure:200,globalLastByte:'NOT_PROVEN',
      liveCloudflare:'NOT_RUN',issue22:'OPEN',release:'NO_GO'}));
  } finally {
    globalThis.fetch=oldFetch;
    if(oldBase===undefined)delete process.env.TOPWHIZ_CMS_API_BASE;
    else process.env.TOPWHIZ_CMS_API_BASE=oldBase;
    if(oldHost===undefined)delete process.env.TOPWHIZ_CMS_API_HOST;
    else process.env.TOPWHIZ_CMS_API_HOST=oldHost;
  }
});
