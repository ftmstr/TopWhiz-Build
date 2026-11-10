import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {GET} from '../app/media/cms/[id]/route.ts';

/**
 * TUR073: actual Next App Router GET function, not a reconstructed adapter.
 * This verifies *request.signal to upstream fetch signal composition*, not
 * whether a physical TCP disconnect propagates through Next's real server.
 * All upstream fetch calls are intercepted; no network/media/content leakage.
 */
const base="https://cms.ci.invalid/";
const savedFetch=globalThis.fetch;
const savedBase=process.env.TOPWHIZ_CMS_API_BASE;
const savedHost=process.env.TOPWHIZ_CMS_API_HOST;
const request=(signal,id='tur073-media')=>new NextRequest('https://topwhiz.ci.invalid/media/cms/'+id,{signal});
const params=(id='tur073-media')=>({params:Promise.resolve({id})});
function gate(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
test.after(()=>{
  globalThis.fetch=savedFetch;
  if(savedBase===undefined)delete process.env.TOPWHIZ_CMS_API_BASE;
  else process.env.TOPWHIZ_CMS_API_BASE=savedBase;
  if(savedHost===undefined)delete process.env.TOPWHIZ_CMS_API_HOST;
  else process.env.TOPWHIZ_CMS_API_HOST=savedHost;
});
function configure(){
  process.env.TOPWHIZ_CMS_API_BASE=base;
  process.env.TOPWHIZ_CMS_API_HOST='cms.ci.invalid';
}
test('TUR073 original Next route: request abort interrupts pending allowlisted upstream fetch, returns 503 no-store',async()=>{
  configure();
  const controller=new AbortController(),entered=gate();
  let remoteSignal=null,fetchCount=0,abortSeen=0;
  globalThis.fetch=(_url,init)=>{
    fetchCount++;
    assert.equal(String(_url),'https://cms.ci.invalid/v1/media/tur073-media');
    assert.equal(init.redirect,'error');
    assert.equal(init.cache,'no-store');
    remoteSignal=init.signal;
    return new Promise((_,reject)=>{
      const stopped=()=>{
        abortSeen++;
        reject(remoteSignal.reason||Error('cancelled'));
      };
      remoteSignal.addEventListener('abort',stopped,{once:true});
      entered.resolve();
    });
  };
  const running=GET(request(controller.signal),params());
  await entered.promise;
  assert.equal(remoteSignal.aborted,false);
  controller.abort('ci_physical_tcp_close_simulated_request_signal');
  const result=await running;
  assert.equal(result.status,503);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal(result.body,null);
  assert.equal(remoteSignal.aborted,true);
  assert.equal(abortSeen,1);
  assert.equal(fetchCount,1);
});
test('TUR073 Next route: abort before dispatch never calls upstream',async()=>{
  configure();
  let upstreamCalls=0;
  globalThis.fetch=async()=>{upstreamCalls++;throw Error('unexpected external fetch')};
  const controller=new AbortController();
  controller.abort('early_close');
  const result=await GET(request(controller.signal),params());
  assert.equal(result.status,503);
  assert.equal(upstreamCalls,0);
});
test('TUR073 Next route: abort while upstream headers arrive cancels body and denies without 200',async()=>{
  configure();
  const controller=new AbortController();
  let bodyCancelled=0;
  const body=new ReadableStream({
    pull(c){c.enqueue(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]));},
    cancel(){bodyCancelled++}
  });
  globalThis.fetch=async(_url,init)=>{
    assert.equal(init.signal.aborted,false);
    controller.abort('before_upstream_headers');
    return new Response(body,{status:200,headers:{
      'content-type':'image/png','content-length':'12'
    }});
  };
  const result=await GET(request(controller.signal),params());
  assert.equal(result.status,503);
  assert.equal(result.body,null);
  assert.equal(bodyCancelled,1);
});
test('TUR073 original Next route: non-aborted fictional verified-header path stays no-store and allowlisted',async()=>{
  configure();
  let calls=0;
  const fictional=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
  globalThis.fetch=async(url,init)=>{
    calls++;
    assert.equal(String(url),'https://cms.ci.invalid/v1/media/tur073-media');
    assert.equal(init.signal.aborted,false);
    return new Response(fictional,{status:200,headers:{
      'content-type':'image/png','content-length':String(fictional.byteLength)
    }});
  };
  const response=await GET(request(new AbortController().signal),params());
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),fictional);
  assert.equal(calls,1);
  process.env.TOPWHIZ_CMS_API_HOST='not-cms.ci.invalid';
  const deny=await GET(request(new AbortController().signal),params());
  assert.equal(deny.status,503);
  assert.equal(calls,1);
  console.log(JSON.stringify({suite:'TUR073_ACTUAL_NEXT_PROXY_SIGNAL_COMPOSITION',
    upstreamRequestSignalPassed:true,earlyAbortFailClosed:true,
    postFetchPreResponseAbortNoByte:true,allowlistedOrigin:true,
    realPhysicalNextDisconnectToRequestSignal:'NOT_TESTED',
    realCloudflareR2Cdn:'NOT_RUN',issue22:'OPEN',release:'NO_GO'}));
});
