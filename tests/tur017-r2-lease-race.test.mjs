import test from "node:test";
import assert from "node:assert/strict";
import {makeSyntheticPng} from "../services/prices-worker/tests/fixtures/png-factory.mjs";
import {stageLicensedMedia} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";
import {handleCmsMedia} from "../services/prices-worker/src/cms/media-handler.mjs";

// Test only a genuine interleaving: first R2 bytes are already consumed
// when a rights revocation lands, before the handler's LAST database lookup.
// Does NOT claim protection after the final lookup / during network transfer.
test("TUR017 delayed R2 streams: 32 in-flight rights revocations must return zero bytes",async()=>{
 const id="ci-tur017-gated-png",bytes=makeSyntheticPng(85,59);
 const objects=new Map();
 let release;
 const gate=new Promise(resolve=>{release=resolve});
 let stalled=0,notifyStalled;
 const allStalled=new Promise(resolve=>{notifyStalled=resolve});
 let lookups=0;
 const bucket={
  async put(key,binary,metadata){
   objects.set(key,{bytes:Uint8Array.from(binary),metadata});
  },
  async get(key){
   const object=objects.get(key);
   if(!object)return null;
   let sent=false;
   return {
    size:object.bytes.length,
    customMetadata:object.metadata.customMetadata,
    httpMetadata:object.metadata.httpMetadata,
    body:new ReadableStream({
     async pull(controller){
      if(!sent){
       sent=true;
       controller.enqueue(object.bytes.slice(0,31));
       return;
      }
      stalled++;
      if(stalled===32)notifyStalled();
      await gate;
      controller.enqueue(object.bytes.slice(31));
      controller.close();
     }
    })
   };
  }
 };
 const staged=await stageLicensedMedia(bucket,id,bytes,{
  rightsApproved:true,evidenceRef:"CI_SELF_GENERATED_ORIGINAL_PNG",
  reviewer:"Independent Synthetic Media Reviewer"
 });
 const approved={id,key:staged.key,bytes:staged.bytes,
  sha256Hex:staged.sha256,contentType:staged.contentType,rightsApproved:true};
 let live=true;
 const finder=async()=>{
  lookups++;
  return live?approved:null;
 };
 const uri="https://r2.ci.invalid/v1/media/"+id;
 const pending=Array.from({length:32},()=>handleCmsMedia(
  new Request(uri),{bucket,findApprovedAsset:finder}));
 // Avoid a hanging test if the response ever stops streaming, or if
 // the implementation begins sending unverified bytes prematurely.
 await Promise.race([
  allStalled,
  new Promise((_,reject)=>setTimeout(()=>reject(Error("r2_interleaving_not_reached")),10000))
 ]);
 live=false;
 release();
 const responses=await Promise.all(pending);
 assert.equal(stalled,32);
 assert.equal(lookups,64,"one lookup before stream and one before response for every request");
 assert.ok(responses.every(x=>x.status===404));
 for(const response of responses){
  assert.equal((await response.arrayBuffer()).byteLength,0,
   "in-flight revoked media must not contain even the first PNG chunk");
  for(const header of ["cache-control","cdn-cache-control","cloudflare-cdn-cache-control"])
   assert.match(response.headers.get(header)??"",/no-store/);
 }
 live=true;
 const head=await handleCmsMedia(new Request(uri,{method:"HEAD"}),{
  bucket,findApprovedAsset:finder});
 assert.equal(head.status,200);
 assert.equal(head.headers.get("content-length"),String(bytes.length));
 assert.equal((await head.arrayBuffer()).byteLength,0);
 console.log(JSON.stringify({suite:"TUR017_R2_STREAM_REVOKE",
  requests:32,denied:32,leakedBytes:0,rightsLookupsBeforeHead:64,
  headAfterRenewal:200,realR2:"NOT_RUN",
  afterFinalCheckDistributedTOCTOU:"UNRESOLVED"}));
});
