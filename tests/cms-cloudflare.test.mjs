import test from "node:test";
import assert from "node:assert/strict";
import {
  createCloudflareZonePurger, createCloudflareQueueSender,
  validatePurgeEvent, dispatchCmsOutbox, consumeCmsPurgeBatch,stageLicensedMedia
} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";

const event={
  eventId:"11111111-1111-4111-8111-111111111111",
  submissionId:"22222222-2222-4222-8222-222222222222",
  revision:2,kind:"published",routes:["/haberler/demo-haber","/haberler","/"]
};
test("queue accepts only typed exact website routes; blocks external URL purge",()=>{
  assert.deepEqual(validatePurgeEvent(event),event);
  for(const bad of [
    {...event,routes:["https://evil.test/"]},
    {...event,routes:["//evil.test"]},
    {...event,routes:["/haberler/../../evil"]},
    {...event,routes:["/admin"]},
    {...event,revision:-1},
    {...event,eventId:"bad"},
    {...event,kind:"delete-everything"}
  ]) assert.throws(()=>validatePurgeEvent(bad),/invalid_cache_event/);
});
test("publisher outbox retains event on Queue failure and acks only on acceptance",async()=>{
  const pending=[{
    id:event.eventId,submission_id:event.submissionId,revision_no:2,
    event_kind:"published",routes:event.routes
  }];
  const marked=[];
  const repository={
    async pendingOutbox(){return pending.filter(row=>!marked.includes(row.id));},
    async markDelivered(id){marked.push(id);}
  };
  await assert.rejects(()=>dispatchCmsOutbox(repository,{async send(){throw Error("offline")}}),/offline/);
  assert.deepEqual(marked,[]);
  const sent=[];
  const result=await dispatchCmsOutbox(repository,{async send(item){sent.push(item)}});
  assert.equal(result.delivered,1);assert.deepEqual(marked,[event.eventId]);
  assert.equal(sent[0].eventId,event.eventId);
});
test("real-shape Cloudflare Queue HTTP API sender checks success and never makes unsafe URL",async()=>{
  const calls=[];
  const sender=createCloudflareQueueSender({
    fetcher:async(url,opts)=>{calls.push([url,opts]);return {ok:true,json:async()=>({success:true})}},
    accountId:"a".repeat(32),queueId:"b".repeat(32),apiToken:"secret-in-memory"
  });
  await sender.send(event);
  assert.equal(calls.length,1);
  assert.equal(JSON.parse(calls[0][1].body).content_type,"json");
  assert.ok(calls[0][0].startsWith("https://api.cloudflare.com/"));
  assert.throws(()=>createCloudflareQueueSender({fetcher:fetch,accountId:"not-valid",queueId:"b".repeat(32),apiToken:"x"}));
});
test("consumer acks success and retries Cloudflare failures",async()=>{
  const outcomes=[];
  const batch={messages:[{body:event,ack(){outcomes.push("ack")},retry(){outcomes.push("retry")}},
    {body:{...event,routes:["/../bad"]},ack(){outcomes.push("bad-ack")},retry(){outcomes.push("bad-retry")}}]};
  await consumeCmsPurgeBatch(batch,async()=>{});
  assert.deepEqual(outcomes,["ack","bad-retry"]);
  await consumeCmsPurgeBatch({messages:[{body:event,ack(){outcomes.push("ack2")},retry(){outcomes.push("retry2")}}]},async()=>{throw Error("offline")});
  assert.ok(outcomes.includes("retry2"));
});
test("Cloudflare purge is globally scoped by verified origin and safe routes",async()=>{
  const requests=[];
  const purge=createCloudflareZonePurger({
    fetcher:async(url,opts)=>{requests.push([url,opts]);return {ok:true,json:async()=>({success:true})}},
    zoneId:"a".repeat(32),apiToken:"private-token",origin:"https://test.example.org/"
  });
  await purge(["/haberler/demo-haber","/"]);
  assert.deepEqual(JSON.parse(requests[0][1].body).files,
    ["https://test.example.org/haberler/demo-haber","https://test.example.org/"]);
  await assert.rejects(()=>purge(["/admin"]));
  assert.equal(requests.length,1);
});
test("R2 stages only signed-off PNG/JPEG/WebP by digest and cannot publish image",async()=>{
  const objects=[];
  const bucket={async put(key,bytes,meta){objects.push({key,bytes,meta})}};
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
  await assert.rejects(()=>stageLicensedMedia(bucket,"image-01",png,{rightsApproved:false,evidenceRef:"source-ref",reviewer:"Test Reviewer"}));
  const receipt=await stageLicensedMedia(bucket,"image-01",png,{
    rightsApproved:true,evidenceRef:"source-rights-test",reviewer:"Test Reviewer"
  });
  assert.equal(receipt.publicationStatus,"staged");
  assert.ok(receipt.key.startsWith("media/reviewed/image-01/"));
  assert.equal(receipt.contentType,"image/png");
  assert.equal(objects.length,1);
  assert.equal(objects[0].meta.httpMetadata.cacheControl,"private, no-store");
});
