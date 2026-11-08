import test from "node:test";
import assert from "node:assert/strict";
import {makeSyntheticPng} from "../services/prices-worker/tests/fixtures/png-factory.mjs";
import {stageLicensedMedia} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";
import {handleCmsMedia} from "../services/prices-worker/src/cms/media-handler.mjs";
const id="ci-tur013-original-png",url="https://r2.ci.invalid/v1/media/"+id;
function read(metadata,body){
 return {size:body?.length??0,body:new Response(body).body,
   httpMetadata:metadata.httpMetadata,customMetadata:metadata.customMetadata};
}
test("R2 stream digest and second rights check reject in-flight revocation and poisoned metadata",async()=>{
 const png=makeSyntheticPng(256,160);
 const stored=new Map();
 const bucket={async put(key,bytes,metadata){stored.set(key,{bytes:Uint8Array.from(bytes),metadata})},
  async get(key){const a=stored.get(key);return a?read(a.metadata,a.bytes):null}};
 const staged=await stageLicensedMedia(bucket,id,png,{
  rightsApproved:true,evidenceRef:"CI_ORIGINAL_PNG_PIXELS_ONLY",
  reviewer:"Independent CI Image Approver"
 });
 const approved={id,key:staged.key,bytes:staged.bytes,sha256Hex:staged.sha256,contentType:staged.contentType,rightsApproved:true};
 let queries=0, rights=true;
 const find=async()=>{queries++;return rights?approved:null};
 const serve=async()=>handleCmsMedia(new Request(url),{findApprovedAsset:find,bucket});
 const passed=await Promise.all(Array.from({length:96},()=>serve()));
 assert.ok(passed.every(r=>r.status===200&&r.headers.get("cache-control")==="no-store"));
 assert.equal(queries,192,"both BEFORE and AFTER rights checks run for each valid byte response");
 const results=await Promise.all(passed.map(r=>r.arrayBuffer()));
 assert.ok(results.every(r=>Buffer.compare(Buffer.from(r),Buffer.from(png))===0));
 rights=false;
 assert.ok((await Promise.all(Array.from({length:20},()=>serve()))).every(r=>r.status===404));
 rights=true;
 const original=stored.get(staged.key);
 const altered=Uint8Array.from(original.bytes);altered[altered.length-23]^=0x40;
 original.bytes=altered;
 assert.ok((await Promise.all(Array.from({length:96},()=>serve()))).every(r=>r.status===503));
 original.bytes=Uint8Array.from(png);

 // Media approval changes AFTER lookup but BEFORE digest completes.
 const inflightBucket={...bucket,async get(key){
  const a=await bucket.get(key);
  rights=false;
  return a;
 }};
 assert.equal((await handleCmsMedia(new Request(url),{
  findApprovedAsset:find,bucket:inflightBucket})).status,404);
 rights=true;

 // Upstream body breaks mid-stream: partial data MUST NOT become a 200.
 const interruptedBucket={...bucket,async get(key){
  const a=stored.get(key);
  return {size:a.bytes.length,httpMetadata:a.metadata.httpMetadata,
    customMetadata:a.metadata.customMetadata,
    body:new ReadableStream({start(controller){
      controller.enqueue(a.bytes.slice(0,200));
      controller.error(new Error("synthetic_R2_stream_broken"));
    }})};
 }};
 assert.equal((await handleCmsMedia(new Request(url),{
  findApprovedAsset:find,bucket:interruptedBucket})).status,503);

 // Forged object metadata hash/length must not override trusted database.
 const wrongMeta={...bucket,async get(key){
  const a=stored.get(key);
  return {size:a.bytes.length,httpMetadata:a.metadata.httpMetadata,
    customMetadata:{...a.metadata.customMetadata,sha256:"0".repeat(64)},
    body:new Response(a.bytes).body};
 }};
 assert.equal((await handleCmsMedia(new Request(url),{
  findApprovedAsset:find,bucket:wrongMeta})).status,503);
 const lengthError={...bucket,async get(key){
  const a=await bucket.get(key);return {...a,size:a.size+1};
 }};
 assert.equal((await handleCmsMedia(new Request(url),{
  findApprovedAsset:find,bucket:lengthError})).status,503);
 assert.equal((await handleCmsMedia(new Request(url,{method:"PUT"}),{
  findApprovedAsset:find,bucket})).status,405);
});
