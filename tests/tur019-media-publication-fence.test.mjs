import test from "node:test";
import assert from "node:assert/strict";
import {makeSyntheticPng} from "../services/prices-worker/tests/fixtures/png-factory.mjs";
import {stageLicensedMedia} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";
import {handleCmsMedia} from "../services/prices-worker/src/cms/media-handler.mjs";
import {createLocalMediaPublicationFence} from "../services/prices-worker/src/cms/media-publication-fence.mjs";

async function synthetic(){
 const id="ci-tur019-original-png",bytes=makeSyntheticPng(72,52),saved=new Map();
 const bucket={
  async put(key,data,metadata){saved.set(key,{data:Uint8Array.from(data),metadata})},
  async get(key){
   const x=saved.get(key);
   return x?{size:x.data.byteLength,body:new Response(x.data).body,
    customMetadata:x.metadata.customMetadata,
    httpMetadata:x.metadata.httpMetadata}:null;
  }
 };
 const attested=await stageLicensedMedia(bucket,id,bytes,{
  rightsApproved:true,evidenceRef:"SELF_GENERATED_CI_IMAGE",
  reviewer:"Independent CI Rights Fixture"
 });
 const approved={id,key:attested.key,bytes:attested.bytes,
  sha256Hex:attested.sha256,contentType:attested.contentType,rightsApproved:true};
 return {id,bytes,bucket,approved,req:()=>new Request("https://r2.ci.invalid/v1/media/"+id)};
}
test("TUR019: 24 active single-instance media responses drain/cancel before rights withdrawal COMMIT",async()=>{
 const {id,bytes,bucket,approved,req}=await synthetic();
 const gate=createLocalMediaPublicationFence();
 let rights=true,lookups=0,commits=0,postCommitBytes=0;
 const read=()=>gate.serve(id,()=>handleCmsMedia(req(),{
  findApprovedAsset:async()=>{lookups++;return rights?approved:null},
  bucket
 }));
 const responses=await Promise.all(Array.from({length:24},read));
 assert.ok(responses.every(x=>x.status===200));
 assert.equal(gate.inspectForTest(id).active,24);
 const withdrawal=gate.revoke(id,async()=>{
  rights=false;
  commits++;
 });
 assert.equal(gate.inspectForTest(id).phase,"revoking");
 assert.equal(commits,0,"cannot commit revocation while streams enrolled");
 const late=await Promise.all(Array.from({length:8},read));
 assert.ok(late.every(x=>x.status===503));
 assert.equal(commits,0);
 // Simulate HTTP responses finishing and callers cancelling them;
 // the writer can COMMIT only after *every* stream is exhausted/cancelled.
 const drained=await Promise.all(responses.slice(0,12).map(x=>x.arrayBuffer()));
 assert.ok(drained.every(b=>b.byteLength===bytes.byteLength));
 assert.equal(gate.inspectForTest(id).active,12);
 assert.equal(commits,0);
 await Promise.all(responses.slice(12).map(x=>x.body.cancel("synthetic_client_abort")));
 const result=await withdrawal;
 assert.equal(result.status,"revoked");
 assert.equal(commits,1);
 assert.equal(gate.inspectForTest(id).active,0);
 assert.equal(gate.inspectForTest(id).phase,"revoked");
 const after=await gate.serve(id,()=>{throw Error("never_called_after_revocation")});
 assert.equal(after.status,404);
 postCommitBytes+=(await after.arrayBuffer()).byteLength;
 assert.equal(postCommitBytes,0);
 assert.equal(lookups,48,"two authoritative lookup checks for each enrolled response");
 console.log(JSON.stringify({suite:"TUR019_LOCAL_STREAM_FENCE",
  admitted:24,cancelled:12,drained:12,lateBlocked:8,
  withdrawalCommits:1,bytesAfterCommit:postCommitBytes,
  scope:"SINGLE_PROCESS_ONLY",liveR2:"NOT_RUN"}));
});

test("TUR019 final-check microtask revocation cannot COMMIT ahead of enrolled body",async()=>{
 const {id,bytes,bucket,approved,req}=await synthetic();
 const gate=createLocalMediaPublicationFence();
 let lookups=0,commits=0,withdrawal;
 const response=await gate.serve(id,()=>handleCmsMedia(req(),{
  bucket,findApprovedAsset:async()=>{
   lookups++;
   if(lookups===2){
    // Reproduce TUR018's exact post-final-DB-lookup scheduling.
    queueMicrotask(()=>{
     withdrawal=gate.revoke(id,async()=>{commits++});
    });
   }
   return approved;
  }
 }));
 assert.equal(lookups,2);
 assert.equal(response.status,200);
 assert.equal(gate.inspectForTest(id).phase,"revoking");
 assert.equal(commits,0,"the DB withdrawer is waiting for the response stream");
 const received=await response.arrayBuffer();
 assert.equal(received.byteLength,bytes.byteLength,
  "old permitted stream may deliver while revocation is PENDING");
 assert.equal((await withdrawal).status,"revoked");
 assert.equal(commits,1);
 const blocked=await gate.serve(id,async()=>new Response(bytes,{status:200}));
 assert.equal(blocked.status,404);
 assert.equal((await blocked.arrayBuffer()).byteLength,0);
});

test("TUR019 stalled stream, read error, no-store, ambiguous COMMIT and cross-isolate gap remain explicit",async()=>{
 const id="ci-tur019-untrusted";
 const gate=createLocalMediaPublicationFence();
 const missing=await gate.serve(id,async()=>new Response("cached",{status:200}));
 assert.equal(missing.status,503);
 assert.equal(gate.inspectForTest(id).active,0);
 const streamResponse=await gate.serve(id,async()=>new Response(
  new ReadableStream({
   pull(controller){
    controller.error(Error("synthetic_stream_failure"));
   }
  }),{headers:{"Cache-Control":"no-store"}}));
 assert.equal(streamResponse.status,200);
 await assert.rejects(()=>streamResponse.arrayBuffer(),/synthetic_stream_failure/);
 assert.equal(gate.inspectForTest(id).active,0,
  "failed HTTP stream must not retain a read permit");
 await assert.rejects(()=>gate.revoke(id,async()=>{
  throw Error("synthetic_commit_response_lost");
 }),/synthetic_commit_response_lost/);
 assert.equal(gate.inspectForTest(id).phase,"quarantined");
 const after=await gate.serve(id,async()=>new Response("should-not-serve"));
 assert.equal(after.status,503);
 assert.equal((await after.arrayBuffer()).byteLength,0);
 await assert.rejects(()=>gate.revoke(id,async()=>{}),
  /media_fence_ambiguous_commit_quarantined/);

 // Independent isolates do NOT share our local fence. This must remain
 // negative evidence: a successful revoke in instance A cannot veto a
 // Response that was admitted through instance B.
 const a=createLocalMediaPublicationFence(),b=createLocalMediaPublicationFence();
 const stale=await b.serve("ci-other-isolate",async()=>new Response(
  Uint8Array.of(1,2,3),{headers:{"Cache-Control":"no-store"}}));
 await a.revoke("ci-other-isolate",async()=>{});
 assert.equal(a.inspectForTest("ci-other-isolate").phase,"revoked");
 assert.equal(b.inspectForTest("ci-other-isolate").phase,"open");
 assert.deepEqual(new Uint8Array(await stale.arrayBuffer()),Uint8Array.of(1,2,3));
 console.log(JSON.stringify({suite:"TUR019_FENCE_NEGATIVE_BOUNDARIES",
  failedCommitQuarantined:true,streamErrorsReleased:true,
  crossIsolateBypassDemonstrated:true,distributedFence:"NOT_IMPLEMENTED",
  lastNetworkByte:"NOT_VERIFIED",realCloudflare:"NOT_RUN"}));
});
