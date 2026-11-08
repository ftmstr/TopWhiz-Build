import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {replayDeadLetters} from "../src/cms/dlq-redrive.mjs";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw Error("TEST_DATABASE_URL required");
const schema="tur012_dlq_load_ci";
test("60 synthetic DLQ messages, audit/Queue outages, replay and completed idempotency",async()=>{
 const admin=new pg.Pool({connectionString,max:1});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString,options:"-c search_path="+schema,max:12});
 try{
  await db.query(readFileSync(new URL("../migrations/0007_cms_queue_receipts.sql",import.meta.url),"utf8"));
  const receipts=makeReceiptStore(async(sql,args)=>(await db.query(sql,args)).rows);
  const items=Array.from({length:60},(_,i)=>({
    eventId:randomUUID(),submissionId:randomUUID(),revision:1,
    kind:"withdrawn",routes:["/haberler/ci-dlq-"+i,"/haberler","/"],
    approved:true,ticket:"FAKE_UNTRUSTED_QUEUED_TICKET"
  }));
  const idToIndex=new Map(items.map((x,i)=>[x.eventId,i]));
  const delivered=new Set<string>(),audited=new Set<string>();
  const acked:string[]=[],retry:string[]=[];
  const message=(body:any)=>({
    body,
    ack(){acked.push(body.eventId)},
    retry(){retry.push(body.eventId)}
  });
  const operator=async({eventId}:{eventId:string})=>{
    const i=idToIndex.get(eventId)!;
    return i%11===0?{approved:false}:
      {approved:true,ticket:"INDEPENDENT_CI_AUDIT_TICKET_123",operator:"Independent CI Operator"};
  };
  const audit=async({eventId,outcome}:{eventId:string;outcome:string})=>{
    const i=idToIndex.get(eventId)!;
    if(i%13===0)throw Error("synthetic_audit_outage");
    if(outcome==="resend_requested")audited.add(eventId);
  };
  const queue={async send(event:any){
    const i=idToIndex.get(event.eventId)!;
    if(i%17===0)throw Error("synthetic_queue_offline");
    assert.equal(Object.hasOwn(event,"approved"),false);
    assert.equal(Object.hasOwn(event,"ticket"),false);
    delivered.add(event.eventId);
  }};
  // Six concurrent batches of 10 reflect the configured per-batch limit.
  const results=await Promise.all(Array.from({length:6},(_,batchIndex)=>
    replayDeadLetters({messages:items.slice(batchIndex*10,batchIndex*10+10).map(message)},
     {verifyOperatorTicket:operator,originQueue:queue,receipts,auditReplay:audit})
  ));
  assert.equal(results.reduce((n,r)=>n+r.resent,0),delivered.size);
  assert.equal(results.reduce((n,r)=>n+r.retried,0),retry.length);
  assert.equal(acked.length+retry.length,60);
  assert.ok(retry.length>=10,"inject operator/queue/audit failures");
  assert.deepEqual(new Set(acked),delivered);
  for(const eventId of delivered){
    assert.ok(audited.has(eventId),"operator audit must precede enqueue");
    const claim=await receipts.claim(eventId);
    assert.equal(claim.status,"acquired");
    await receipts.complete(eventId,claim.token);
  }
  const resendChecks=await Promise.all([...delivered].map(eventId=>
    replayDeadLetters({messages:[message(items[idToIndex.get(eventId)!])]},
      {verifyOperatorTicket:operator,originQueue:{async send(){throw Error("illegal_duplicate_redrive")}},
        receipts,auditReplay:async()=>{}})
  ));
  assert.ok(resendChecks.every(x=>x.previouslyCompleted===1&&x.resent===0));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_purge_receipts WHERE status='completed'")).rows[0].n,delivered.size);
  await assert.rejects(()=>replayDeadLetters({messages:Array.from({length:11},()=>message(items[0]))},{
    verifyOperatorTicket:operator,originQueue:queue,receipts,auditReplay:audit
  }),/dlq_batch_limit/);
 }finally{
  await db.end();
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await admin.end();
 }
});
