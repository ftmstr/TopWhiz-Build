/** Local workerd only. Simulates stale client conditional headers, not CDN HITs.
 * A live Cloudflare zone and production licensing/purge must be separately tested.
 */
import assert from "node:assert/strict";
const base="http://127.0.0.1:3116";
for(let retry=0;retry<75;retry++){
 try{if((await fetch(base+"/haberler",{signal:AbortSignal.timeout(1500)})).ok)break}
 catch{}
 if(retry===74)throw Error("local_workerd_unavailable");
 await new Promise(r=>setTimeout(r,200));
}
const paths=["/","/haberler","/telefonlar","/haberler/ci-never-published"];
const headers=[
 {"If-None-Match":"\"synthetic-previously-published-page\""},
 {"If-Modified-Since":"Wed, 01 Jan 2031 00:00:00 GMT"},
 {"If-Range":"\"synthetic-mismatched-media\""},
 {"Cache-Control":"only-if-cached,max-stale=999999"},
 {"Pragma":"no-cache"}
];
const responses=await Promise.all(Array.from({length:60},(_,i)=>fetch(base+paths[i%4],{
 method:"GET",headers:headers[i%headers.length],signal:AbortSignal.timeout(10000)
})));
for(let i=0;i<responses.length;i++){
 const r=responses[i],path=paths[i%4];
 assert.equal(r.status,path.includes("ci-never-published")?404:200,
  "never trust client-controlled validators and stale cache for "+path);
 assert.notEqual(r.status,304,"304 would reuse stale pre-revocation body");
 for(const h of ["cache-control","cdn-cache-control","cloudflare-cdn-cache-control"]){
  assert.match(r.headers.get(h)??"",/no-store/,path+" "+h);
 }
 const body=await r.text();
 assert.ok(!body.includes("adsbygoogle"),"no AdSense");
 assert.ok(!body.includes("postgresql://"),"no database leak");
}
console.log(JSON.stringify({suite:"TUR014_LOCAL_WORKERD_CONDITIONAL_CACHE",
 requests:60,non304:60,allCacheHeadersNoStore:true,liveCdnEvidence:false}));
