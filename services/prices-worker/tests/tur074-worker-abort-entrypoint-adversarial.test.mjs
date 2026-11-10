import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';

// TUR074 adversarial Worker entrypoint checks. No live Cloudflare, Neon or R2.
// This suite intentionally does not claim physical disconnect propagation.
for (const [name,path,expectedStatus] of [
  ['simple-media','/v1/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',503],
  ['encoded-media','/v1/media/%61aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',404],
  ['query-media','/v1/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?x=1',400],
  ['encoded-separator','/v1/media/aaaaaaaa%2faaaa-4aaa-8aaa-aaaaaaaaaaaa',404]
]) {
  test('TUR074 aborted Worker '+name+' never touches DB/R2', {timeout:10000}, async()=>{
    const controller=new AbortController();
    controller.abort(new Error('revoked_before_worker_entry'));
    const req=new Request('https://worker.ci.invalid'+path,{signal:controller.signal});
    let r2=0, external=0;
    const original=globalThis.fetch;
    try {
      globalThis.fetch=async()=>{external++;throw Error('external network forbidden')};
      const response=await worker.fetch(req,{
        DATABASE_URL:'postgresql://ci.invalid/isolated',
        MEDIA_BUCKET:{async get(){r2++;throw Error('unexpected bucket read')}}
      });
      assert.equal(response.status,expectedStatus,'media route input validation precedes abort logic');
      assert.equal((await response.arrayBuffer()).byteLength,0);
      assert.equal(r2,0);
      assert.equal(external,0);
      assert.equal(response.headers.get('cache-control'),'no-store');
    } finally {globalThis.fetch=original}
  });
}
test('TUR074 independent abort controllers do not contaminate health response',async()=>{
  const aborted=new AbortController();aborted.abort();
  const denied=await worker.fetch(new Request('https://worker.ci.invalid/v1/media/x',{signal:aborted.signal}),{
    DATABASE_URL:'postgresql://ci.invalid/isolated',MEDIA_BUCKET:{async get(){throw Error('forbidden')}}
  });
  assert.equal(denied.status,503);
  const fresh=await worker.fetch(new Request('https://worker.ci.invalid/health'),{});
  assert.equal(fresh.status,200);
  assert.equal((await fresh.json()).status,'ok');
});
