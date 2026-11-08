import test from "node:test";
import assert from "node:assert/strict";
import { handleCmsMedia } from "../services/prices-worker/src/cms/media-handler.mjs";
import { stageLicensedMedia } from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";

function png(){return new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);}
test("R2 public media route only serves current approved/linked media",async()=>{
  const objects=new Map();
  const bucket={
    async put(key,bytes,metadata){objects.set(key,{bytes,metadata})},
    async get(key){
      const entry=objects.get(key);if(!entry)return null;
      return {size:entry.bytes.length,body:new Response(entry.bytes).body,
        customMetadata:entry.metadata.customMetadata,
        httpMetadata:entry.metadata.httpMetadata};
    }
  };
  const bytes=png();
  const receipt=await stageLicensedMedia(bucket,"fictional-image",bytes,
    {rightsApproved:true,evidenceRef:"CI-CONTROLLED-SYNTHETIC-LICENSE",reviewer:"Synthetic Reviewer"});
  const asset={id:receipt.assetId,key:receipt.key,sha256Hex:receipt.sha256,
    bytes:receipt.bytes,contentType:receipt.contentType,rightsApproved:true};
  const base="https://cms.example.test/v1/media/fictional-image";
  let consulted=0;
  const approved={findApprovedAsset:async(id)=>{consulted++;return id===asset.id?asset:null},bucket};
  const response=await handleCmsMedia(new Request(base),approved);
  assert.equal(response.status,200);
  assert.equal(response.headers.get("content-type"),"image/png");
  assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  const head=await handleCmsMedia(new Request(base,{method:"HEAD"}),approved);
  assert.equal(head.status,200);
  assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await handleCmsMedia(new Request(base+"?redirect=https://evil.test"),approved)).status,400);
  assert.equal((await handleCmsMedia(new Request(base,{method:"DELETE"}),approved)).status,405);
  assert.equal((await handleCmsMedia(new Request(base),{
    findApprovedAsset:async()=>({...asset,rightsApproved:false}),bucket})).status,404);
  assert.equal((await handleCmsMedia(new Request(base),{
    findApprovedAsset:async()=>({...asset,key:"media/reviewed/../../secrets.png"}),bucket})).status,404);
  assert.equal((await handleCmsMedia(new Request(base),{
    findApprovedAsset:async()=>({...asset,sha256Hex:"0".repeat(64)}),bucket})).status,404);
  assert.equal((await handleCmsMedia(new Request(base),{
    findApprovedAsset:async()=>null,bucket})).status,404);
  assert.ok(consulted>=2);
});
test("mismatch and missing R2 bytes fail closed",async()=>{
  const id="fictional-image";
  const hash="a".repeat(64);
  const asset={key:"media/reviewed/"+id+"/"+hash+".png",
    sha256Hex:hash,contentType:"image/png",bytes:12,rightsApproved:true};
  const req=new Request("https://cms.example.test/v1/media/"+id);
  const data=new Response(png()).body;
  const broken={
    async get(){return {size:12,body:data,customMetadata:{sha256:"invalid"},httpMetadata:{contentType:"image/png"}}}
  };
  assert.equal((await handleCmsMedia(req,{findApprovedAsset:async()=>asset,bucket:broken})).status,503);
  assert.equal((await handleCmsMedia(req,{findApprovedAsset:async()=>asset,bucket:{get:async()=>null}})).status,404);
});

test("tampered R2 bytes are rejected even if object metadata claims original SHA",async()=>{
  const valid=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
  const {stageLicensedMedia}=await import("../services/prices-worker/src/cms/cloudflare-adapters.mjs");
  const storage=new Map();
  const bucket={
    async put(key,bytes,metadata){storage.set(key,{bytes,metadata})},
    async get(key){
      const saved=storage.get(key);
      if(!saved)return null;
      const altered=new Uint8Array(saved.bytes);
      altered[11]=255; // identical length and image signature, WRONG SHA-256
      return {size:altered.length,body:new Response(altered).body,
        customMetadata:saved.metadata.customMetadata,
        httpMetadata:saved.metadata.httpMetadata};
    }
  };
  const receipt=await stageLicensedMedia(bucket,"tamper-ci",valid,{
    rightsApproved:true,evidenceRef:"SYNTHETIC_IMAGE_RIGHTS",reviewer:"CI Reviewer"});
  const asset={key:receipt.key,sha256Hex:receipt.sha256,bytes:receipt.bytes,
    contentType:receipt.contentType,rightsApproved:true};
  const response=await handleCmsMedia(new Request("https://cms.example.test/v1/media/tamper-ci"),{
    findApprovedAsset:async()=>asset,bucket
  });
  assert.equal(response.status,503,"spoofed R2 metadata must not bypass byte-level digest validation");
});
