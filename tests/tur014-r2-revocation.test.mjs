import test from "node:test";
import assert from "node:assert/strict";
import {makeSyntheticPng} from "../services/prices-worker/tests/fixtures/png-factory.mjs";
import {stageLicensedMedia} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";
import {handleCmsMedia} from "../services/prices-worker/src/cms/media-handler.mjs";
test("128 synthetic R2 responses race rights before and after digest; license tamper never leaks bytes",async()=>{
 const bytes=makeSyntheticPng(220,150),id="ci-tur014-r2-original";
 const map=new Map();
 const bucket={async put(k,data,meta){map.set(k,{data:Uint8Array.from(data),meta})},
  async get(k){const v=map.get(k);return v?{size:v.data.length,
   body:new Response(v.data).body,
   httpMetadata:v.meta.httpMetadata,customMetadata:v.meta.customMetadata}:null}
 };
 const receipt=await stageLicensedMedia(bucket,id,bytes,{
  rightsApproved:true,evidenceRef:"CI_OWN_GENERATED_IMAGE_PIXELS",
  reviewer:"Independent CI Rights Controller"
 });
 const metadata={id,key:receipt.key,bytes:receipt.bytes,
  sha256Hex:receipt.sha256,contentType:receipt.contentType,rightsApproved:true};
 const url="https://synthetic.invalid/v1/media/"+id;
 let before=0,after=0;
 function readWithRights(revokeDuringStream=false){
  let n=0;
  return handleCmsMedia(new Request(url),{
   findApprovedAsset:async()=>{
    n++;if(n===1){before++;return metadata}
    after++;return revokeDuringStream?null:metadata;
   },bucket});
 }
 const requests=await Promise.all([
  ...Array.from({length:64},()=>readWithRights(false)),
  ...Array.from({length:64},()=>readWithRights(true))
 ]);
 assert.equal(requests.filter(x=>x.status===200).length,64);
 assert.equal(requests.filter(x=>x.status===404).length,64);
 assert.equal(before,128);assert.equal(after,128);
 for(let i=0;i<64;i++){
  assert.ok(requests[i].headers.get("cache-control")?.includes("no-store"));
  assert.deepEqual(Buffer.from(await requests[i].arrayBuffer()),Buffer.from(bytes));
 }
 for(const r of requests.slice(64)){
  const text=await r.text();assert.equal(r.status,404);
  assert.ok(!text.includes("PNG"),"revoked image must not leak payload");
 }
 const corrupted=map.get(receipt.key);
 corrupted.data=Uint8Array.from(bytes);
 corrupted.data[corrupted.data.length-30]^=0x80;
 const denied=await Promise.all(Array.from({length:48},()=>readWithRights(false)));
 assert.ok(denied.every(x=>x.status===503));
 assert.equal((await handleCmsMedia(new Request(url,{method:"POST"}),{
  findApprovedAsset:async()=>metadata,bucket
 })).status,405);
});
