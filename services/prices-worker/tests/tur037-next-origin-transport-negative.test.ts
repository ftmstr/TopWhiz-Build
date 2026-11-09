import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../../apps/web/app/media/cms/[id]/route.ts';

/** TUR037: actual Next GET origin allowlist and transport failures, no live network. */
test('TUR037 rejects unsafe origins before fetch and fails closed on transport errors', async () => {
  const previousFetch=globalThis.fetch;
  const previousBase=process.env.TOPWHIZ_CMS_API_BASE;
  const previousHost=process.env.TOPWHIZ_CMS_API_HOST;
  let calls=0;
  const route=()=>GET(new Request('http://localhost/media/cms/fictional-media') as any,
    {params:Promise.resolve({id:'fictional-media'})});
  const assertDenied=(response:Response)=>{
    assert.equal(response.status,503);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.equal(response.body,null);
  };
  try {
    globalThis.fetch=(async()=>{calls++;throw new Error('transport-failure')}) as typeof fetch;
    const unsafe=[
      'http://cms.ci.invalid/',
      'https://cms.ci.invalid.evil.invalid/',
      'https://user:pass@cms.ci.invalid/',
      'https://cms.ci.invalid:444/',
      'https://cms.ci.invalid/v1/',
      'https://cms.ci.invalid/?q=1',
      'https://cms.ci.invalid/#fragment',
      'not a url'
    ];
    process.env.TOPWHIZ_CMS_API_HOST='cms.ci.invalid';
    for(const origin of unsafe){
      process.env.TOPWHIZ_CMS_API_BASE=origin;
      assertDenied(await route());
      assert.equal(calls,0,'unsafe origin must not trigger fetch: '+origin);
    }
    process.env.TOPWHIZ_CMS_API_BASE='https://cms.ci.invalid/';
    assertDenied(await route());
    assert.equal(calls,1,'valid origin reaches transport; transport error fails closed');
    globalThis.fetch=(async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://elsewhere.invalid/'}})}) as typeof fetch;
    assertDenied(await route());
    assert.equal(calls,2,'redirect must never become a media response');
    globalThis.fetch=(async()=>{calls++;return new Response(null,{status:500})}) as typeof fetch;
    assertDenied(await route());
    assert.equal(calls,3);
    console.log(JSON.stringify({suite:'TUR037_NEXT_ORIGIN_TRANSPORT_NEGATIVE',
      unsafeOrigins:unsafe.length,transportFailure:true,redirectDenied:true,
      upstream500Denied:true,liveCloudflare:'NOT_RUN',
      lastNetworkByte:'NOT_PROVEN',issue22:'OPEN',release:'NO_GO'}));
  } finally {
    globalThis.fetch=previousFetch;
    if(previousBase===undefined)delete process.env.TOPWHIZ_CMS_API_BASE;
    else process.env.TOPWHIZ_CMS_API_BASE=previousBase;
    if(previousHost===undefined)delete process.env.TOPWHIZ_CMS_API_HOST;
    else process.env.TOPWHIZ_CMS_API_HOST=previousHost;
  }
});
