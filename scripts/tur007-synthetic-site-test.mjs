import assert from "node:assert/strict";
import { readFileSync,writeFileSync } from "node:fs";

const registry=new URL("../apps/web/data/published-content.json",import.meta.url);
const mode=process.argv[2];
if(process.env.CI!=="true")throw Error("Synthetic smoke test is CI-only; refusal to overwrite developer data");
if(mode==="prepare"){
  const current=JSON.parse(readFileSync(registry,"utf8"));
  assert.deepEqual(current,{news:[],phones:[]},"Public fixture must begin entirely empty");
  const fixture={
    news:[{
      slug:"ci-only-news-synthetic",title:"CI ONLY: Synthetic TopWhiz Technology News",
      summary:"Synthetic fixture exclusively for validating article routes, never a real technology announcement.",
      body:"This news entry is a fictional CI fixture. It must never reach production or be treated as a report about a real company, model, price or upcoming release.",
      publishedAt:"2026-11-07T21:00:00Z",author:"CI Fixture Author",
      sources:[{label:"Synthetic Reference",url:"https://example.org/ci-test-evidence"}]
    }],
    phones:[{
      slug:"ci-only-synthetic-phone",title:"CI ONLY: Synthetic 256 GB Phone",
      summary:"Fictional device test fixture used only for Next.js route smoke validation.",
      brand:"Fictional CI Manufacturer",modelCode:"CI-NONREAL-256",market:"TR",
      variants:[{name:"CI 8GB 256GB",ramGb:8,storageGb:256,warrantyClass:"Synthetic"}],
      specifications:[{label:"RAM",value:"8 GB (synthetic)",sourceLabel:"Synthetic Reference"}]
    }]
  };
  writeFileSync(registry,JSON.stringify(fixture,null,2)+"\n");
  process.stdout.write("CI-only fictional content fixture prepared; NEVER commit this generated file.\n");
}else if(mode==="verify"){
  const root="http://127.0.0.1:3107";
  const checks=[
    ["/","CI ONLY: Synthetic TopWhiz Technology News"],
    ["/haberler","CI ONLY: Synthetic TopWhiz Technology News"],
    ["/haberler/ci-only-news-synthetic","CI Fixture Author"],
    ["/telefonlar","CI ONLY: Synthetic 256 GB Phone"],
    ["/telefonlar/ci-only-synthetic-phone","CI-NONREAL-256"]
  ];
  for(const [path,needle] of checks){
    let response;
    for(let i=0;i<25;i++){
      try{response=await fetch(root+path,{redirect:"manual",signal:AbortSignal.timeout(5000)});break}
      catch{await new Promise(resolve=>setTimeout(resolve,400))}
    }
    assert.ok(response, "local Next.js server not ready: "+path);
    assert.equal(response.status,200,"expected a rendered page: "+path);
    const html=await response.text();
    assert.ok(html.includes(needle),"missing approved fixture placement: "+path);
    for(const label of ["REKLAM ALANI","TOPWHIZ"]){
      assert.ok(html.includes(label),"layout missing "+label+" at "+path);
    }
    assert.ok(!html.includes("adsbygoogle.js"),"real AdSense code must not load");
  }
  const blocked=await fetch(root+"/media/cms/ci-only-image",{redirect:"manual"});
  assert.equal(blocked.status,503,"unconfigured R2/CMS image proxy must fail closed");
  const missing=await fetch(root+"/haberler/not-a-ci-story",{redirect:"manual"});
  assert.equal(missing.status,404);
  process.stdout.write("5 Next.js rendered routes + 1 missing detail + media fail-closed PASS (CI-only synthetic registry).\n");
}else{
  throw Error("usage: node scripts/tur007-synthetic-site-test.mjs prepare|verify");
}
