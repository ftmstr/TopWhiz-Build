/** TUR018 synthetic local vinext/workerd stale-conditional adversarial load.
 * No Cloudflare edge hit, no real cache purge, no live preview.
 */
import assert from "node:assert/strict";
const base="http://127.0.0.1:3116";
for(let k=0;k<90;k++){
 try{if((await fetch(base+"/haberler",{signal:AbortSignal.timeout(2000)})).status===200)break}
 catch{}
 if(k===89)throw Error("tur018_local_vinext_workerd_not_ready");
 await new Promise(r=>setTimeout(r,100));
}
const routes=["/","/haberler","/telefonlar","/haberler/ci-tur018-revoked"];
const headers=[
 {"If-None-Match":'"published-before-rights-withdrawal"',"Cache-Control":"max-stale=999999"},
 {"If-Modified-Since":"Tue, 31 Dec 2030 23:59:59 GMT","Pragma":"no-cache"},
 {"If-Range":'"historic-png-etag"',"Range":"bytes=0-99999"},
 {"If-None-Match":"*","Cache-Control":"only-if-cached"},
 {"Range":"bytes=11-80","If-Modified-Since":"Fri, 01 Jan 2032 00:00:00 GMT"},
 {"Cache-Control":"public,max-age=604800","If-None-Match":'W/"revoked-old-version"'}
];
let ok=0,denied=0;
for(let round=0;round<3;round++){
 const batch=Array.from({length:40},(_,j)=>{
  const index=round*40+j;
  return {route:routes[index%routes.length],headers:headers[index%headers.length]};
 });
 const result=await Promise.all(batch.map(async item=>({
  ...item,response:await fetch(base+item.route,{
   headers:item.headers,signal:AbortSignal.timeout(18000)
  })
 })));
 for(const {route,response} of result){
  assert.equal(response.status,route.includes("revoked")?404:200);
  assert.notEqual(response.status,304,"old ETag must not authorize stale 304");
  assert.notEqual(response.status,206,"partial old licensed page must not leak");
  for(const k of ["cache-control","cdn-cache-control","cloudflare-cdn-cache-control"])
   assert.match(response.headers.get(k)??"",/no-store/);
  const html=await response.text();
  assert.ok(!html.includes("adsbygoogle.js"));
  assert.ok(!html.includes("postgresql://"));
  if(route.includes("revoked"))denied++;else ok++;
 }
}
assert.equal(ok,90);assert.equal(denied,30);
console.log(JSON.stringify({suite:"TUR018_VINEXT_LOCAL_CACHE_120",
 localRequests:120,ok,denied,no304:true,no206:true,
 realCloudflareEdge:"NOT_RUN",globalPurge:"NOT_RUN"}));
