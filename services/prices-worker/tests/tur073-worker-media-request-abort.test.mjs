import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';

/**
 * TUR073: exercise ORIGINAL Cloudflare Worker fetch entrypoint locally under
 * Node web-standard Request, not an invented handler. Verify that forwarding
 * a pre-aborted Request.signal prevents any CMS DB or R2 interaction.
 * A real Cloudflare client disconnect -> Request.signal event remains unproven.
 */
test('TUR073 original Worker: already aborted request fails closed before Neon/R2, without external network',{timeout:10000},async()=>{
  const originalFetch=globalThis.fetch;
  let interceptedExternal=0,r2Reads=0;
  const controller=new AbortController();
  controller.abort('ci_node_physical_disconnect_simulated_signal');
  const request=new Request('https://worker.ci.invalid/v1/media/tur073-media',{
    method:'GET',signal:controller.signal
  });
  try{
    globalThis.fetch=async(..._args)=>{
      interceptedExternal++;
      throw Error('TUR073 forbids all external network during Worker signal test');
    };
    const response=await worker.fetch(request,{
      DATABASE_URL:'postgresql://ci.invalid/not-a-real-database',
      MEDIA_BUCKET:{async get(){r2Reads++;throw Error('R2 must not be touched')}}
    });
    assert.equal(response.status,503);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('content-type'),null,
      'original CMS handler empty fail-closed response, not Worker JSON not-configured path');
    assert.equal((await response.arrayBuffer()).byteLength,0);
    assert.equal(interceptedExternal,0);
    assert.equal(r2Reads,0);
    console.log(JSON.stringify({
      suite:'TUR073_ACTUAL_WORKER_REQUEST_SIGNAL_TO_CMS_HANDLER',
      actualWorkerEntrySource:true,requestSignalAlreadyAborted:true,
      CMSHandlerFailClosedBeforeDb:true,externalFetchAttempts:interceptedExternal,
      fictionalR2Reads:r2Reads,clientDisconnectToRequestSignal:'NOT_PROVEN',
      independentGuardianInProduction:'NOT_WIRED',actualNeonR2Cdn:'NOT_RUN',
      issue22:'OPEN',release:'NO_GO'
    }));
  }finally{globalThis.fetch=originalFetch}
});
