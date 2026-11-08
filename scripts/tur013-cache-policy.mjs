/** TUR013 local Cloudflare RSC app must make EVERY public HTML response
 * non-storeable. These tests do NOT prove previously cached LIVE edge
 * objects were purged (there is no zone/account/deployment in CI).
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const config=readFileSync(new URL("../apps/web/vite.workerd.config.ts",import.meta.url),"utf8");
const apiConfig=readFileSync(new URL("../services/prices-worker/wrangler.toml",import.meta.url),"utf8");
for(const src of [config,apiConfig])assert.match(src,/cache\s*[:=].*enabled\s*[:=]\s*false|enabled\s*=\s*false/s);
assert.match(config,/remoteBindings:false/);
assert.match(config,/workers_dev:false/);
const base="http://127.0.0.1:3116";
let ready=false;
for(let i=0;i<75;i++){
 try{
  const r=await fetch(base+"/haberler",{signal:AbortSignal.timeout(1500)});
  if(r.status===200){ready=true;break}
 }catch{}
 await new Promise(r=>setTimeout(r,150));
}
assert.ok(ready,"local workerd did not become ready");
for(const path of ["/","/haberler","/telefonlar","/robots.txt","/haberler/not-published"]){
 const response=await fetch(base+path,{signal:AbortSignal.timeout(10000)});
 const cc=response.headers.get("cache-control");
 assert.match(cc??"",/no-store/,"Edge HTML must not be cacheable "+path);
 assert.equal(response.headers.get("cloudflare-cdn-cache-control"),"no-store");
 assert.equal(response.headers.get("cdn-cache-control"),"no-store");
 assert.equal(response.status,path.includes("not-published")?404:200);
 assert.ok(!response.headers.has("set-cookie"),"preview must not emit auth cookie");
 const body=await response.text();
 assert.ok(!body.includes("adsbygoogle.js"),"no ad code");
}
console.log("TUR013 local vinext/workerd: five RSC/SSR routes all no-store, deny unpublished; PASS");
