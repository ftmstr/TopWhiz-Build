/**
 * Runs only against ephemeral Cloudflare workerd locally, NO remote binding.
 * Starts NO server itself and never connects to external hosts.
 */
import assert from "node:assert/strict";
const base="http://127.0.0.1:8789";
async function api(path,opts){
  const r=await fetch(base+path,{...opts,signal:AbortSignal.timeout(4000)});
  const text=await r.text();
  assert.ok(text.length<30000,"unexpectedly large Worker response");
  return {r,body:JSON.parse(text)};
}
let ready=false;
for(let i=0;i<45;i++){
  try{
    const result=await api("/health");
    if(result.r.status===200){ready=true;break;}
  }catch{await new Promise(r=>setTimeout(r,400))}
}
assert.ok(ready,"local workerd did not start");
const health=await api("/health");
assert.deepEqual(health.body,{status:"ok",mode:"read_only"});
assert.match(health.r.headers.get("content-type")??"",/application\/json/);
assert.match(health.r.headers.get("cache-control")??"",/no-store/);
assert.equal((await api("/health",{method:"POST"})).r.status,405);
assert.equal((await api("/v1/prices?variantId=INVALID&market=TR")).r.status,400);
const validId="11111111-1111-4111-8111-111111111111";
const unavailable=await api("/v1/prices?variantId="+validId+"&market=TR");
assert.equal(unavailable.r.status,503);
assert.deepEqual(unavailable.body.offers,[]);
assert.equal(unavailable.body.status,"not_configured");
const noCMS=await api("/v1/content?type=news");
assert.equal(noCMS.r.status,503);
const noR2=await api("/v1/media/ci-only-image");
assert.equal(noR2.r.status,503);
const bad=await api("/not-an-endpoint");
assert.equal(bad.r.status,404);
for(const data of [health,unavailable,noCMS,noR2,bad]){
  assert.equal(data.r.headers.get("x-content-type-options"),"nosniff");
  assert.ok(!JSON.stringify(data.body).includes("postgresql://"));
  assert.ok(!JSON.stringify(data.body).includes("adsbygoogle"));
}
process.stdout.write("TUR010 PASS: ephemeral local workerd health/405/400/503/404, no CMS/real prices/R2/ads.\n");
