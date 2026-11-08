import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";
import {replayDeadLetters} from "../src/cms/dlq-redrive.mjs";
const uri=process.env.TEST_DATABASE_URL;
if(!uri)throw Error("TEST_DATABASE_URL required");
const schema="tur009_dlq_ci";
const ids={
  finished:"11111111-1111-4111-8111-111111111111",
  resend:"22222222-2222-4222-8222-222222222222",
  busy:"33333333-3333-4333-8333-333333333333",
  denied:"44444444-4444-4444-8444-444444444444",
  invalid:"55555555-5555-4555-8555-555555555555",
  offline:"66666666-6666-4666-8666-666666666666"
};
const payload=(eventId,route="/haberler/ci-only-test")=>({
  eventId,submissionId:"77777777-7777-4777-8777-777777777777",
  revision:1,kind:"withdrawn",routes:[route,"/haberler","/"]
});
test("DLQ replay uses independent ticket, persistent receipts and audited Queue acceptance",async()=>{
 const admin=new pg.Pool({connectionString:uri,max:1});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:uri,options:"-c search_path="+schema,max:2});
 try{
  await db.query(readFileSync(new URL("../migrations/0007_cms_queue_receipts.sql",import.meta.url),"utf8"));
  const receipts=makeReceiptStore(async(sql,args)=>(await db.query(sql,args)).rows);
  const final=await receipts.claim(ids.finished);
  assert.equal(final.status,"acquired");
  await receipts.complete(ids.finished,final.token);
  const busy=await receipts.claim(ids.busy);
  assert.equal(busy.status,"acquired");
  assert.equal(await receipts.status(ids.finished),"completed");
  assert.equal(await receipts.status(ids.resend),"missing");
  assert.equal(await receipts.status(ids.busy),"processing");
  const delivered=[],audit=[],acks=[],retry=[];
  function message(event){return {
    body:event,
    ack(){acks.push(event.eventId)},
    retry(options){retry.push({id:event.eventId,delay:options.delaySeconds})}
  }}
  const events=[
    payload(ids.finished),payload(ids.resend),payload(ids.busy),
    payload(ids.denied),payload(ids.invalid,"/../../../secrets"),payload(ids.offline)
  ];
  const result=await replayDeadLetters({messages:events.map(message)},{
    verifyOperatorTicket:async ({eventId})=>
      eventId===ids.denied?{approved:false}:{
        approved:true,ticket:"CI-REPLAY-TICKET-001",operator:"Independent CI Operator"
      },
    receipts,
    auditReplay:async entry=>{audit.push(entry)},
    originQueue:{async send(ev){
      if(ev.eventId===ids.offline)throw Error("synthetic queue offline");
      delivered.push(ev.eventId);
    }}
  });
  assert.deepEqual(result,{resent:1,previouslyCompleted:1,retried:4});
  assert.deepEqual(delivered,[ids.resend]);
  assert.deepEqual(acks.sort(),[ids.finished,ids.resend].sort());
  assert.equal(retry.length,4);
  assert.ok(retry.every(x=>x.delay===60));
  assert.equal(audit.find(x=>x.eventId===ids.finished)?.outcome,"already_completed");
  assert.equal(audit.find(x=>x.eventId===ids.resend)?.outcome,"resend_requested");
  assert.equal(audit.some(x=>x.eventId===ids.denied||x.eventId===ids.invalid),false);
  await assert.rejects(
    ()=>replayDeadLetters({messages:[message(payload(ids.resend))]},{}),
    /dlq_requires_authenticated_operator_and_audit/);
  // Idempotent redelivery after the main queue completes this replay.
  const second=await receipts.claim(ids.resend);
  await receipts.complete(ids.resend,second.token);
  const another=await replayDeadLetters({messages:[message(payload(ids.resend))]},{
    verifyOperatorTicket:async()=>({
      approved:true,ticket:"CI-REPLAY-TICKET-002",operator:"Independent CI Operator"
    }),receipts,
    auditReplay:async entry=>audit.push(entry),
    originQueue:{async send(){throw Error("MUST_NOT_RESEND")}}
  });
  assert.equal(another.previouslyCompleted,1);
  assert.equal(another.resent,0);
 }finally{
  await db.end();await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");await admin.end();
 }
});
