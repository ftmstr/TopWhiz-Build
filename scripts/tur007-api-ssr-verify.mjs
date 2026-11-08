import assert from "node:assert/strict";
if(process.env.CI!=="true"||process.env.TOPWHIZ_SYNTHETIC_API!=="1")
  throw Error("Synthetic API-to-SSR verification is CI-only");
const origin="http://127.0.0.1:3108";
const pages=[
  ["/","CI API: Synthetic TopWhiz Article"],
  ["/haberler","CI API: Synthetic TopWhiz Article"],
  ["/haberler/ci-api-published-news","CI Verified Test Writer"],
  ["/telefonlar","CI API: Synthetic 256 GB Phone"],
  ["/telefonlar/ci-api-published-phone","CI-NOT-REAL"]
];
for(const [path,needle] of pages){
  let response;
  for(let i=0;i<35;i++){
    try{response=await fetch(origin+path,{signal:AbortSignal.timeout(5000)});break}
    catch{await new Promise(resolve=>setTimeout(resolve,350))}
  }
  assert.ok(response,"Next SSR did not start: "+path);
  assert.equal(response.status,200,"Expected HTTP 200 at "+path);
  const html=await response.text();
  assert.ok(html.includes(needle),"PostgreSQL-backed CMS content missing at "+path);
  assert.ok(html.includes("REKLAM ALANI"),"Reserved Ads layout was removed at "+path);
  assert.ok(!html.includes("adsbygoogle.js"),"AdSense scripts unexpectedly loaded");
  assert.ok(html.includes("TOPWHIZ"),"Brand header missing");
  if(path.startsWith("/haberler/")||path.startsWith("/telefonlar/"))
    assert.ok(html.includes("/media/cms/ci-ssr-hero"),"Licensed R2 route not rendered");
}
const picture=await fetch(origin+"/media/cms/ci-ssr-hero");
assert.equal(picture.status,200,"Approved media did not reach Next.js local proxy");
assert.equal(picture.headers.get("content-type"),"image/png");
assert.equal(picture.headers.get("cache-control"),"no-store");
assert.ok((await picture.arrayBuffer()).byteLength>70,"complete licensed synthetic PNG expected");
const notFound=await fetch(origin+"/haberler/no-such-approved-story");
assert.equal(notFound.status,404);
process.stdout.write("CI verified: Real PostgreSQL approved news + phone -> injected CMS HTTP contract -> actual Next.js SSR (5 pages), R2-shaped image and 404; all local-only.\n");
