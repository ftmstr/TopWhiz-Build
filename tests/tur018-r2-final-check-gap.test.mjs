/** TUR018: adversarial, synthetic-only proof of an UNSOLVED boundary.
 * Revocation AFTER the second successful DB rights lookup can still occur
 * before bytes are returned. This deliberately measures the residual race;
 * it does not claim R2, network/CDN, or streaming atomicity is fixed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {makeSyntheticPng} from "../services/prices-worker/tests/fixtures/png-factory.mjs";
import {stageLicensedMedia} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";
import {handleCmsMedia} from "../services/prices-worker/src/cms/media-handler.mjs";

test("TUR018 demonstrates post-final-lookup rights withdrawal remains a release blocker",async()=>{
 const id="ci-tur018-post-check",bytes=makeSyntheticPng(54,44),objects=new Map();
 const bucket={
  async put(key,data,metadata){objects.set(key,{data:Uint8Array.from(data),metadata})},
  async get(key){
   const a=objects.get(key);
   if(!a)return null;
   return {size:a.data.length,body:new Response(a.data).body,
    customMetadata:a.metadata.customMetadata,httpMetadata:a.metadata.httpMetadata};
  }
 };
 const saved=await stageLicensedMedia(bucket,id,bytes,{
  rightsApproved:true,evidenceRef:"CI_GENERATED_LICENSE_ONLY",
  reviewer:"CI Synthetic Independent Reviewer"
 });
 const asset={id,key:saved.key,bytes:saved.bytes,sha256Hex:saved.sha256,
  contentType:saved.contentType,rightsApproved:true};
 let afterFinalRevocations=0,bytesReturnedAfterRevoke=0;
 for(let i=0;i<12;i++){
  let checks=0,rightsLive=true;
  const response=await handleCmsMedia(new Request("https://r2.ci.invalid/v1/media/"+id),{
   bucket,
   findApprovedAsset:async()=>{
    checks++;
    if(checks===2){
     // This interleaving occurs AFTER the verified lookup result has
     // been produced, but BEFORE the HTTP Response is constructed.
     queueMicrotask(()=>{rightsLive=false});
     return asset;
    }
    return rightsLive?asset:null;
   }
  });
  assert.equal(checks,2);
  assert.equal(rightsLive,false);
  assert.equal(response.status,200,
   "known TOCTOU: a previously authorized snapshot can still be served");
  assert.equal(response.headers.get("cache-control"),"no-store");
  const len=(await response.arrayBuffer()).byteLength;
  assert.equal(len,bytes.length);
  afterFinalRevocations++;
  bytesReturnedAfterRevoke+=len;
 }
 assert.ok(bytesReturnedAfterRevoke>0,
  "this test must reveal the known residual risk, not fake remediation");
 console.log(JSON.stringify({
  suite:"TUR018_POST_FINAL_RIGHTS_TOCTOU_NEGATIVE_EVIDENCE",
  syntheticInterleavings:afterFinalRevocations,
  bytesReturnedAfterWithdrawal:bytesReturnedAfterRevoke,
  risk:"OPEN_RELEASE_BLOCKER",
  realR2:"NOT_RUN",realCDN:"NOT_RUN",
  mitigation:"future atomic publication/revocation gate required"
 }));
});
