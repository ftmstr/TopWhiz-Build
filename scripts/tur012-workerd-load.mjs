import assert from "node:assert/strict";
const base="http://127.0.0.1:3116";
async function request(path){
 const start=performance.now();
 const response=await fetch(base+path,{signal:AbortSignal.timeout(12000)});
 const html=await response.text();
 return {status:response.status,html,ms:performance.now()-start,
   noindex:response.headers.get("x-robots-tag")};
}
for(let i=0;i<70;i++){
 try{if((await request("/haberler")).status===200)break}
 catch{await new Promise(r=>setTimeout(r,250))}
 if(i===69)throw Error("local vinext workerd failed start");
}
const urls=["/","/haberler","/telefonlar","/robots.txt","/haberler/ci-unpublished"];
const results=await Promise.all(Array.from({length:40},(_,i)=>request(urls[i%urls.length])));
for(let i=0;i<results.length;i++){
 const r=results[i],route=urls[i%urls.length];
 assert.equal(r.status,route.endsWith("ci-unpublished")?404:200,route);
 assert.ok(r.ms<12000,"synthetic workerd response budget");
 assert.ok(!r.html.includes("adsbygoogle"),"ads cannot activate");
 assert.ok(!r.html.includes("postgresql://"),"no DB secret leak");
 if(!route.includes("robots")&&!route.includes("unpublished")){
  assert.ok(r.html.includes("TOPWHIZ"),"invalid synthetic site response");
  assert.ok(r.html.includes("REKLAM ALANI"),"ad placeholder removed");
  assert.match(r.html,/noindex/i);
 }
}
const timings=results.map(r=>r.ms).sort((a,b)=>a-b);
const p95=timings[Math.ceil(timings.length*0.95)-1];
assert.ok(p95<12000);
console.log(JSON.stringify({suite:"TUR012_LOCAL_VINEXT_WORKERD",requests:results.length,
  p95Milliseconds:Math.round(p95),allPass:true,
  note:"CI localhost sampling only, NOT production Core Web Vitals or capacity"}));
