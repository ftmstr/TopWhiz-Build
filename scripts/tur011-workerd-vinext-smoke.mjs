/** Assert real App Router pages are served by local @cloudflare/vite-plugin
 * workerd, never a remote Cloudflare Worker or the separate Next.js server. */
import assert from "node:assert/strict";
const base="http://127.0.0.1:3116";
let up=false;
for(let i=0;i<80;i++){
  try{
    const res=await fetch(base+"/haberler",{signal:AbortSignal.timeout(2000)});
    if(res.status===200){up=true;break;}
  }catch{await new Promise(r=>setTimeout(r,350))}
}
assert.ok(up,"isolated workerd-hosted vinext app did not serve /haberler");
for(const route of [
  {path:"/",part:"TOPWHIZ"},
  {path:"/haberler",part:"Teknoloji Haberleri"},
  {path:"/telefonlar",part:"Telefon Kataloğu"},
  {path:"/robots.txt",part:"Disallow"}
]){
  const start=performance.now();
  const result=await fetch(base+route.path,{signal:AbortSignal.timeout(12000)});
  const body=await result.text();
  assert.equal(result.status,200,route.path+" must be served via Cloudflare Vite plugin");
  assert.ok(body.includes(route.part),route.path+" missing expected marker");
  assert.ok(body.length<2_000_000,route.path+" unexpected large body");
  assert.ok(!body.includes("adsbygoogle.js"),"no real ad script allowed");
  assert.ok(!body.includes("postgresql://"),"no real database DSN allowed");
  assert.ok(performance.now()-start<12_000,"local request took longer than 12s");
  if(route.path!=="/robots.txt"){
    assert.match(body,/noindex/i,"unreleased Cloudflare pages must not be indexed");
    assert.match(body,/REKLAM ALANI/,"ad placeholders must remain inactive");
  }
}
const missing=await fetch(base+"/haberler/ci-not-published");
assert.equal(missing.status,404,"unpublished content must not resolve");
process.stdout.write("TUR011 workerd VINEXT App Router HTML PASS: home/news/phones/robots/404; local only.\n");
