import test from "node:test";
import assert from "node:assert/strict";
import {makeSyntheticPng} from "../services/prices-worker/tests/fixtures/png-factory.mjs";
import {stageLicensedMedia} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";
import {handleCmsMedia} from "../services/prices-worker/src/cms/media-handler.mjs";

/** This is an in-memory CI-only R2 emulator with entirely ORIGINAL pixel data.
 * It does not prove Cloudflare R2, AV/EXIF processing, CDN invalidation,
 * or an end-to-end per-request lock spanning a remote network response.
 */
test("160 concurrent approved/revoked R2 reads plus 64 corrupted/partial object probes fail closed",async()=>{
 const id="ci-tur015-original-png",bytes=makeSyntheticPng(240,164),stored=new Map();
 const bucket={
  async put(key,binary,metadata){stored.set(key,{data:Uint8Array.from(binary),metadata})},
  async get(key){
   const value=stored.get(key);
   if(!value)return null;
   return {size:value.data.length,body:new Response(value.data).body,
    customMetadata:value.metadata.customMetadata,
    httpMetadata:value.metadata.httpMetadata};
  }
 };
 const info=await stageLicensedMedia(bucket,id,bytes,{
  rightsApproved:true,evidenceRef:"ORIGINAL_CI_PIXEL_RIGHTS_ONLY",
  reviewer:"Independent CI Media Rights Verifier"
 });
 const approved={id,key:info.key,bytes:info.bytes,sha256Hex:info.sha256,
  contentType:info.contentType,rightsApproved:true};
 const req=(method="GET")=>new Request("https://r2.ci.invalid/v1/media/"+id,{method});
 let checksBefore=0,checksAfter=0;
 function read({revoke=false,changed=false,method="GET"}={}){
  let current=0;
  return handleCmsMedia(req(method),{
   bucket,
   findApprovedAsset:async()=>{
    current++;
    if(current===1){checksBefore++;return approved}
    checksAfter++;
    return revoke?null:changed?{...approved,sha256Hex:"f".repeat(64)}:approved;
   }
  });
 }
 const responses=await Promise.all([
  ...Array.from({length:80},()=>read()),
  ...Array.from({length:80},()=>read({revoke:true}))
 ]);
 assert.equal(responses.filter(x=>x.status===200).length,80);
 assert.equal(responses.filter(x=>x.status===404).length,80);
 assert.equal(checksBefore,160);assert.equal(checksAfter,160);
 for(const [index,r] of responses.entries()){
  assert.equal(r.headers.get("cache-control"),"no-store");
  assert.equal(r.headers.get("cloudflare-cdn-cache-control"),"no-store");
  if(index<80)assert.deepEqual(Buffer.from(await r.arrayBuffer()),Buffer.from(bytes));
  else assert.equal((await r.arrayBuffer()).byteLength,0,"revoked rights cannot return image bytes");
 }
 assert.equal((await read({changed:true})).status,404);
 const head=await read({method:"HEAD"});
 assert.equal(head.status,200);
 assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal(head.headers.get("content-length"),String(bytes.length));

 // Every changed byte is rejected, including an intact metadata SHA-256
 // that falsely claims the object was not modified.
 const old=stored.get(info.key);
 old.data=Uint8Array.from(bytes);
 old.data[old.data.length-24]^=0x40;
 const mutated=await Promise.all(Array.from({length:32},()=>read()));
 assert.ok(mutated.every(x=>x.status===503));
 old.data=Uint8Array.from(bytes);
 const disruptedBucket={...bucket,async get(key){
  const obj=stored.get(key);
  return {size:obj.data.length,customMetadata:obj.metadata.customMetadata,
   httpMetadata:obj.metadata.httpMetadata,
   body:new ReadableStream({start(controller){
    controller.enqueue(obj.data.slice(0,50));
    controller.error(new Error("synthetic_stream_interrupted"));
   }})};
 }};
 const interrupted=await Promise.all(Array.from({length:32},()=>
  handleCmsMedia(req(),{findApprovedAsset:async()=>approved,bucket:disruptedBucket})));
 assert.ok(interrupted.every(x=>x.status===503));
 assert.ok(interrupted.every(x=>x.headers.get("cache-control")==="no-store"));
 console.log(JSON.stringify({suite:"TUR015_SYNTHETIC_R2_RACE",
  originalApproved:80,revokedBeforeRelease:80,byteMutationsDenied:32,
  interruptedStreamsDenied:32,realR2Bucket:"NOT_RUN"}));
});
