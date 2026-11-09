import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../../apps/web/app/media/cms/[id]/route.ts';

/** Negative evidence: one revocation cannot retroactively fence independent admitted streams. */
test('TUR040 parallel admitted Next GET streams survive synthetic revocation', async () => {
  const oldFetch=globalThis.fetch;
  const oldBase=process.env.TOPWHIZ_CMS_API_BASE;
  const oldHost=process.env.TOPWHIZ_CMS_API_HOST;
  let resume!:()=>void;
  const gate=new Promise<void>(resolve=>{resume=resolve;});
  let revoked=false;
  let calls=0;
  try {
    process.env.TOPWHIZ_CMS_API_BASE='https://cms.ci.invalid/';
    process.env.TOPWHIZ_CMS_API_HOST='cms.ci.invalid';
    globalThis.fetch=(async()=>{
      calls++;
      if(revoked)return new Response(null,{status:403});
      const streamId=calls;
      return new Response(new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new Uint8Array(12).fill(streamId));
          await gate;
          controller.enqueue(new Uint8Array(8).fill(streamId+10));
          controller.close();
        }
      }),{status:200,headers:{'content-type':'image/png','content-length':'20'}});
    }) as typeof fetch;
    const request=()=>GET(new Request('http://localhost/media/cms/fictional-media') as any,
      {params:Promise.resolve({id:'fictional-media'})});
    const [first,second]=await Promise.all([request(),request()]);
    assert.equal(first.status,200);
    assert.equal(second.status,200);
    assert.equal(first.headers.get('cache-control'),'no-store');
    assert.equal(second.headers.get('cache-control'),'no-store');
    revoked=true;
    const fresh=await request();
    assert.equal(fresh.status,503);
    assert.equal(fresh.headers.get('cache-control'),'no-store');
    resume();
    const [a,b]=await Promise.all([first.arrayBuffer(),second.arrayBuffer()]);
    assert.equal(a.byteLength,20);
    assert.equal(b.byteLength,20);
    assert.deepEqual(Array.from(new Uint8Array(a).slice(12)),Array(8).fill(11));
    assert.deepEqual(Array.from(new Uint8Array(b).slice(12)),Array(8).fill(12));
    assert.equal(calls,3);
    console.log(JSON.stringify({suite:'TUR040_PARALLEL_INFLIGHT_REVOKE_NEGATIVE',
      admittedStreams:2,postRevokeBytes:16,freshStatus:fresh.status,
      actualPostCommit:'NOT_RUN',realCDN:'NOT_RUN',lastNetworkByte:'NOT_PROVEN',
      issue22:'OPEN',release:'NO_GO'}));
  } finally {
    resume?.();
    globalThis.fetch=oldFetch;
    if(oldBase===undefined)delete process.env.TOPWHIZ_CMS_API_BASE;
    else process.env.TOPWHIZ_CMS_API_BASE=oldBase;
    if(oldHost===undefined)delete process.env.TOPWHIZ_CMS_API_HOST;
    else process.env.TOPWHIZ_CMS_API_HOST=oldHost;
  }
});
