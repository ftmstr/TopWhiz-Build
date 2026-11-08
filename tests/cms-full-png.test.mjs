import test from "node:test";
import assert from "node:assert/strict";
import {makeSyntheticPng} from "../services/prices-worker/tests/fixtures/png-factory.mjs";
import {validPngStructure} from "../services/prices-worker/src/cms/png-structure.mjs";
import {stageLicensedMedia} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";
import {handleCmsMedia} from "../services/prices-worker/src/cms/media-handler.mjs";

const authorized={
 rightsApproved:true,evidenceRef:"ORIGINAL_SELF_GENERATED_PNG_CI",reviewer:"Independent CI Reviewer"
};
test("complete self-generated RGBA PNG passes IHDR, IDAT, IEND and CRC constraints",()=>{
 const png=makeSyntheticPng(256,192);
 assert.ok(png.length>1000,"fixture must have actual zlib-compressed image pixels");
 assert.equal(validPngStructure(png),true);
 for(const modified of [
   png.slice(0,-1),
   new Uint8Array([...png,0]),
   Uint8Array.from(png,(v,i)=>i===16?v^1:v),
   Uint8Array.from(png,(v,i)=>i===40?v^1:v),
   Uint8Array.from(png,(v,i)=>i===png.length-5?v^1:v)
 ])assert.equal(validPngStructure(modified),false);
 assert.equal(validPngStructure(makeSyntheticPng(9000,1)),false);
});
test("R2 stages and serves full synthetic image but blocks byte corruption after metadata attestations",async()=>{
 const data=makeSyntheticPng(20,15);
 const objects=new Map();
 const bucket={
  async put(key,bytes,meta){objects.set(key,{bytes,meta});},
  async get(key){
   const o=objects.get(key);
   if(!o)return null;
   return {size:o.bytes.length,body:new Response(o.bytes).body,
     customMetadata:o.meta.customMetadata,
     httpMetadata:o.meta.httpMetadata};
  }
 };
 await assert.rejects(()=>stageLicensedMedia(bucket,"ci-full-png",data.slice(0,20),authorized),
   /invalid_png_structure/);
 const receipt=await stageLicensedMedia(bucket,"ci-full-png",data,authorized);
 const asset={id:receipt.assetId,key:receipt.key,
   bytes:receipt.bytes,sha256Hex:receipt.sha256,
   contentType:receipt.contentType,rightsApproved:true};
 const request=new Request("https://cms.example.invalid/v1/media/ci-full-png");
 const legitimate=await handleCmsMedia(request,{bucket,findApprovedAsset:async()=>asset});
 assert.equal(legitimate.status,200);
 assert.deepEqual(new Uint8Array(await legitimate.arrayBuffer()),data);
 const stored=objects.get(receipt.key);
 // Attacker manipulates real bytes, but preserves falsely reassuring object
 // metadata, MIME and content length; response MUST fail closed.
 const altered=Uint8Array.from(stored.bytes);
 altered[altered.length-16]^=0x40;
 stored.bytes=altered;
 const tampered=await handleCmsMedia(request,{bucket,findApprovedAsset:async()=>asset});
 assert.equal(tampered.status,503);
 const truncated=stored.bytes.slice(0,-2);
 stored.bytes=truncated;
 const shorter=await handleCmsMedia(request,{bucket,findApprovedAsset:async()=>asset});
 assert.equal(shorter.status,503);
});
