/** TUR017 — localhost vinext/workerd ONLY, never an edge/CDN claim.
 * Conditional requests are adversarial stale-cache probes, not purge proof.
 */
import assert from "node:assert/strict";
const base="http://127.0.0.1:3116";
for(let i=0;i<90;i++){
 try{
  if((await fetch(base+"/haberler",{signal:AbortSignal.timeout(1600)})).status===200)break;
 }catch{}
 if(i===89)throw Error("tur017_local_workerd_not_ready");
 await new Promise(r=>setTimeout(r,100));
}
const routes=["/","/haberler","/telefonlar","/haberler/ci-tur017-unpublished"];
const validators=[
 {"If-None-Match":'"historic-licensed-page-v1"', "Cache-Control":"max-stale=999999"},
 {"If-Modified-Since":"Mon, 09 Nov 2037 12:00:00 GMT","Pragma":"no-cache"},
 {"If-Range":'"old-object-etag"',Range:"bytes=0-99"},
 {"Cache-Control":"public, max-age=86400","If-None-Match":'W/"old-weak-version"'},
 {"If-None-Match":"*","Cache-Control":"only-if-cached"},
 {"If-Modified-Since":"Tue, 01 Jan 2030 00:00:00 GMT",Range:"bytes=10-80"}
];
const counts={ok:0,missing:0,notModified:0,errors:0};
for(let round=0;round<3;round++){
 const items=Array.from({length:48},(_,n)=>{
  const i=round*48+n;
  return {i,route:routes[i%routes.length],headers:validators[i%validators.length]};
 });
 const responses=await Promise.all(items.map(async x=>({
  ...x,response:await fetch(base+x.route,{headers:x.headers,
   signal:AbortSignal.timeout(20000)})
 })));
 for(const {route,response} of responses){
  assert.notEqual(response.status,304,"stale 304 reuses revoked content");
  if(response.status===304)counts.notModified++;
  assert.equal(response.status,route.includes("unpublished")?404:200);
  if(response.status===404)counts.missing++;
  else counts.ok++;
  for(const header of ["cache-control","cdn-cache-control","cloudflare-cdn-cache-control"])
   assert.match(response.headers.get(header)??"",/no-store/);
  const body=await response.text();
  assert.ok(!body.includes("adsbygoogle.js"));
  assert.ok(!body.includes("postgresql://"));
  assert.ok(!body.includes("CLOUDFLARE_API_TOKEN"));
 }
}
assert.equal(counts.ok,108);
assert.equal(counts.missing,36);
console.log(JSON.stringify({suite:"TUR017_LOCAL_RSC_STALE_VALIDATOR_LOAD",
 requests:144,...counts,network:"localhost",globalCloudflareCachePurge:"NOT_RUN"}));
