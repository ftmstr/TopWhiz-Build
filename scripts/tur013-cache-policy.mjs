/** TUR013 local Cloudflare RSC app must make EVERY public HTML response
 * non-storeable. These tests do NOT prove previously cached LIVE edge
 * objects were purged (there is no zone/account/deployment in CI).
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const config=readFileSync(new URL("../apps/web/vite.workerd.config.ts",import.meta.url),"utf8");
const apiConfig=readFileSync(new URL("../services/prices-worker/wrangler.toml",import.meta.url),"utf8");
assert.match(config,/cache\s*:\s*\{\s*enabled\s*:\s*false/);
assert.match(apiConfig,/\[cache\]\s*enabled\s*=\s*false/);
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
 // robots.txt is served directly as a STATIC asset before the Worker,
 // contains only the universal "Disallow: /" policy, not licensed CMS HTML.
 // Its max-age=0 caching is not a content-freshness bypass.
 if(path==="/robots.txt"){
   assert.ok((await response.text()).includes("Disallow: /"),"static robots must disable indexing");
   continue;
 }
 const cc=response.headers.get("cache-control");
 assert.match(cc??"",/no-store/,"Edge HTML must not be cacheable "+path);
 assert.equal(response.headers.get("cloudflare-cdn-cache-control"),"no-store");
 assert.equal(response.headers.get("cdn-cache-control"),"no-store");
 assert.equal(response.status,path.includes("not-published")?404:200);
 assert.ok(!response.headers.has("set-cookie"),"preview must not emit auth cookie");
 const body=await response.text();
 assert.ok(!body.includes("adsbygoogle.js"),"no ad code");
}
console.log("TUR013 local vinext/workerd: dynamic RSC/SSR routes no-store (static robots separate), deny unpublished; PASS");
