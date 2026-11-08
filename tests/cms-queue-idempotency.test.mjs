import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {consumeCmsPurgeBatch} from "../services/prices-worker/src/cms/cloudflare-adapters.mjs";
const event={
  eventId:"11111111-1111-4111-8111-111111111111",
  submissionId:"22222222-2222-4222-8222-222222222222",
  revision:1,kind:"withdrawn",routes:["/haberler/test-ci","/haberler","/"]
};
test("durable receipt gate acks already completed without purging twice",async()=>{
  const touched=[];
  const outcome=[];
  const claims=["acquired","completed"];
  const receipts={
    async claim(){return {status:claims.shift(),token:"33333333-3333-4333-8333-333333333333"}},
    async complete(){outcome.push("completed")},
    async release(){outcome.push("released")}
  };
  const msg=()=>({
    body:event,attempts:2,
    ack(){outcome.push("ack")},
    retry(options){outcome.push("retry:"+options.delaySeconds)}
  });
  await consumeCmsPurgeBatch({messages:[msg(),msg()]},async routes=>{touched.push(...routes)},receipts);
  assert.equal(touched.length,3);
  assert.deepEqual(outcome,["completed","ack","ack"]);
});
test("busy event retries; failed global purge releases claim for re-delivery and DLQ",async()=>{
  const outcome=[];
  const receipt={
    async claim(){return {status:"busy"}},
    async complete(){throw Error("must-not-complete")},
    async release(){throw Error("must-not-release")}
  };
  const msg={body:event,attempts:3,ack(){outcome.push("ack")},retry(x){outcome.push(x.delaySeconds)}};
  await consumeCmsPurgeBatch({messages:[msg]},async()=>{},receipt);
  assert.deepEqual(outcome,[30]);
  const broken={
    async claim(){return {status:"acquired",token:"33333333-3333-4333-8333-333333333333"}},
    async complete(){throw Error("failure")},
    async release(){outcome.push("released")}
  };
  await consumeCmsPurgeBatch({messages:[msg]},async()=>{},broken);
  assert.deepEqual(outcome,[30,"released",20]);
});
test("example preview config has nondeploy DLQ and bounded retries",()=>{
  const cfg=readFileSync(new URL("../services/prices-worker/wrangler.cms.preview.example.toml",import.meta.url),"utf8");
  assert.match(cfg,/dead_letter_queue\s*=\s*"topwhiz-preview-cms-purge-dlq"/);
  assert.match(cfg,/max_retries\s*=\s*5/);
  assert.match(cfg,/workers_dev\s*=\s*false/);
  const active=readFileSync(new URL("../services/prices-worker/wrangler.cms.toml",import.meta.url),"utf8");
  assert.doesNotMatch(active,/^\s*\[\[queues\.consumers\]\]/m);
});
