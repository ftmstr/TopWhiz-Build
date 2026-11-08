/** TUR015 local vinext/workerd regression.
 * Cannot observe or clean existing live Cloudflare zone cached objects.
 */
import assert from "node:assert/strict";
const base="http://127.0.0.1:3116";
for(let n=0;n<80;n++){
 try{if((await fetch(base+"/haberler",{signal:AbortSignal.timeout(1200)})).status===200)break}
 catch{}
 if(n===79)throw Error("local workerd did not start");
 await new Promise(done=>setTimeout(done,100));
}
const routes=["/","/haberler","/telefonlar","/haberler/ci-not-published"];
const headers=[
 {"If-None-Match":"\"fictional-stale-etag-before-revocation\"","Cache-Control":"only-if-cached,max-stale=999999"},
 {"If-Modified-Since":"Wed, 05 Oct 2039 09:00:00 GMT","Pragma":"no-cache"},
 {"If-Range":"\"fictional-old-phone-etag\"","Range":"bytes=0-500"},
 {"Cache-Control":"public,max-age=99999"},
 {"If-None-Match":"W/\"synthetic-stale-2025\""}
];
const rows=await Promise.all(Array.from({length:96},(_,i)=>{
 return fetch(base+routes[i%routes.length],{headers:headers[i%headers.length],
  signal:AbortSignal.timeout(12000)});
}));
for(let i=0;i<rows.length;i++){
 const response=rows[i],route=routes[i%routes.length];
 assert.equal(response.status,route.includes("not-published")?404:200);
 assert.notEqual(response.status,304,"never instruct a client to reuse old page");
 for(const h of ["cache-control","cdn-cache-control","cloudflare-cdn-cache-control"]){
  assert.match(response.headers.get(h)??"",/no-store/);
 }
 const html=await response.text();
 assert.ok(!html.includes("adsbygoogle"),"no real advertisements");
 assert.ok(!html.includes("postgresql://"),"no DB connection string");
}
console.log(JSON.stringify({suite:"TUR015_WORKERD_CACHE_VALIDATORS",
 localRequests:rows.length,notModified304:0,noStoreAll:true,
 liveCloudflareGlobalPurge:"NOT_RUN"}));
