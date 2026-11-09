/** TOPWHIZ TUR020: LOCAL VITE/WORKERD ONLY. No real CDN caches.
 * Repeated conditional probes are not proof of revocation at the edge.
 */
import assert from "node:assert/strict";
const base="http://127.0.0.1:3116";
for(let i=0;i<100;i++){
 try{
  if((await fetch(base+"/telefonlar",{signal:AbortSignal.timeout(2000)})).status===200)break;
 }catch{}
 if(i===99)throw Error("tur020_local_workerd_not_ready");
 await new Promise(resolve=>setTimeout(resolve,100));
}
const routes=["/","/haberler","/telefonlar","/telefonlar/ci-tur020-revoked"];
const headers=[
 {"If-None-Match":'"old-image-published"',"Cache-Control":"max-stale=999999"},
 {"If-Modified-Since":"Tue, 01 Jan 2036 00:00:00 GMT","Pragma":"no-cache"},
 {"If-Range":'"before-revocation-etag"',"Range":"bytes=0-2048"},
 {"Range":"bytes=4-99","Cache-Control":"public,max-age=9999999"},
 {"If-None-Match":"*","Cache-Control":"only-if-cached"}
];
let success=0,denied=0;
for(let round=0;round<4;round++){
 const batch=Array.from({length:32},(_,j)=>{
  const n=round*32+j;
  return {route:routes[n%routes.length],headers:headers[n%headers.length]};
 });
 const responses=await Promise.all(batch.map(async q=>({
  ...q,reply:await fetch(base+q.route,{headers:q.headers,
   signal:AbortSignal.timeout(20000)})
 })));
 for(const {route,reply} of responses){
  assert.equal(reply.status,route.includes("revoked")?404:200);
  assert.notEqual(reply.status,304);
  assert.notEqual(reply.status,206);
  for(const key of ["cache-control","cdn-cache-control","cloudflare-cdn-cache-control"])
   assert.match(reply.headers.get(key)??"",/no-store/);
  const text=await reply.text();
  assert.ok(!text.includes("adsbygoogle.js"));
  assert.ok(!text.includes("postgresql://"));
  if(route.includes("revoked"))denied++;else success++;
 }
}
assert.equal(success,96);
assert.equal(denied,32);
console.log(JSON.stringify({suite:"TUR020_LOCAL_WORKERD_STALE_128",
 requests:128,success,denied,notModified304:0,partial206:0,
 actualCloudflareCDN:"NOT_RUN",globalPurge:"NOT_RUN"}));
