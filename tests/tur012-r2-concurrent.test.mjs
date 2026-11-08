import test from "node:test";
import assert from "node:assert/strict";
import {makeSyntheticPng} from "../services/prices-worker/tests/fixtures/png-factory.mjs";
import {stageLicensedMedia} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";
import {handleCmsMedia} from "../services/prices-worker/src/cms/media-handler.mjs";
test("128 concurrent R2-like reads rehash whole synthetic PNG, reject tamper and revoked rights",async()=>{
 const bytes=makeSyntheticPng(256,160);
 const objects=new Map();
 const bucket={
  async put(key,raw,metadata){objects.set(key,{raw,metadata})},
  async get(key){
   const obj=objects.get(key);
   if(!obj)return null;
   return {size:obj.raw.length,body:new Response(obj.raw).body,
    customMetadata:obj.metadata.customMetadata,httpMetadata:obj.metadata.httpMetadata};
  }
 };
 const key="ci-tur012-original-art";
 const approved=await stageLicensedMedia(bucket,key,bytes,{
  rightsApproved:true,evidenceRef:"SYNTHETIC_ORIGINAL_PIXELS_ONLY",
  reviewer:"Independent CI Rights Verifier"
 });
 const asset={id:key,key:approved.key,bytes:approved.bytes,
  sha256Hex:approved.sha256,contentType:approved.contentType,rightsApproved:true};
 const makeReq=(method="GET")=>new Request("https://r2.ci.invalid/v1/media/"+key,{method});
 const serve=(method)=>handleCmsMedia(makeReq(method),{
  findApprovedAsset:async()=>asset,bucket
 });
 const responses=await Promise.all(Array.from({length:64},()=>serve("GET")));
 assert.ok(responses.every(r=>r.status===200&&r.headers.get("cache-control")==="no-store"));
 const heads=await Promise.all(Array.from({length:8},()=>serve("HEAD")));
 assert.ok(heads.every(r=>r.status===200&&r.headers.get("content-length")===String(bytes.length)));
 const bodies=await Promise.all(responses.map(r=>r.arrayBuffer()));
 assert.ok(bodies.every(b=>Buffer.compare(Buffer.from(b),Buffer.from(bytes))===0));
 const stored=objects.get(approved.key);
 stored.raw=Uint8Array.from(stored.raw);
 stored.raw[stored.raw.length-17]^=0x40;
 const corrupted=await Promise.all(Array.from({length:64},()=>serve("GET")));
 assert.ok(corrupted.every(r=>r.status===503));
 const revoked=await handleCmsMedia(makeReq(),{
  findApprovedAsset:async()=>({...asset,rightsApproved:false}),bucket
 });
 assert.equal(revoked.status,404);
 assert.equal((await handleCmsMedia(makeReq("POST"),{
  findApprovedAsset:async()=>asset,bucket
 })).status,405);
 const path=new Request("https://r2.ci.invalid/v1/media/"+key+"?bypass=true");
 assert.equal((await handleCmsMedia(path,{
  findApprovedAsset:async()=>asset,bucket
 })).status,400);
 const resized=Uint8Array.from(bytes.slice(0,-2));
 stored.raw=resized;
 const truncated=await serve("GET");
 assert.equal(truncated.status,503);
});
