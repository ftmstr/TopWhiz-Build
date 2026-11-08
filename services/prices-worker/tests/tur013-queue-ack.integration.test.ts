import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";
import {fingerprintPurgeEvent,consumeCmsPurgeBatch,validatePurgeEvent} from "../src/cms/cloudflare-adapters.mjs";
const uri=process.env.TEST_DATABASE_URL;
if(!uri)throw Error("TEST_DATABASE_URL required");
const schema="tur013_queue_ack_ci";
const uuid1="11111111-1111-4111-8111-111111111111";
const uuid2="22222222-2222-4222-8222-222222222222";
test("outbox-verified Queue delivery ACK only after persisted purger receipt, block forged UUID body",async()=>{
 const admin=new pg.Pool({connectionString:uri,max:1});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:uri,options:"-c search_path="+schema,max:20});
 try{
  for(const migration of [
   "0003_content_cms.sql","0004_cms_delivery.sql",
   "0007_cms_queue_receipts.sql","0011_cms_queue_receipt_hash.sql"
  ])await db.query(readFileSync(new URL("../migrations/"+migration,import.meta.url),"utf8"));
  const submission=(await db.query(
   "INSERT INTO content_submissions(external_key,content_type,slug,payload,state) VALUES('ci-queue','news','ci-queue','{}'::jsonb,'pending_review') RETURNING id"
  )).rows[0].id;
  const routes=["/haberler/ci-queue","/haberler","/"];
  const make=async(id:string,revision:number)=>{
   const row=(await db.query(
    "INSERT INTO cms_delivery_outbox(id,submission_id,revision_no,event_kind,routes) VALUES($1,$2,$3,'withdrawn',$4::jsonb) RETURNING *",
    [id,submission,revision,JSON.stringify(routes)])).rows[0];
   return {eventId:row.id,submissionId:row.submission_id,revision:row.revision_no,kind:row.event_kind,routes:row.routes};
  };
  const first=await make(uuid1,2),second=await make(uuid2,3);
  const receipts=makeReceiptStore(async(sql,args)=>(await db.query(sql,args)).rows);
  let purgeCount=0,acked=0,retried=0,delays=[];
  function message(event:any,attempts=1){return {
    body:event,attempts,
    ack(){acked++},retry({delaySeconds}:any){retried++;delays.push(delaySeconds)}
  }}
  const purger=async()=>{purgeCount++;await new Promise(r=>setTimeout(r,10))};
  const messages=Array.from({length:40},()=>message(first));
  await Promise.all(messages.map(m=>consumeCmsPurgeBatch({messages:[m]},purger,receipts)));
  assert.equal(purgeCount,1,"only one authoritative durable event may initiate purge under contention");
  assert.equal(acked+retried,40);
  assert.equal(await receipts.status(uuid1,await fingerprintPurgeEvent(first)),"completed");
  const row=(await db.query("SELECT status,event_sha256,attempts FROM cms_purge_receipts WHERE event_id=$1",[uuid1])).rows[0];
  assert.equal(row.status,"completed");
  assert.equal(row.event_sha256,await fingerprintPurgeEvent(first));
  assert.ok(row.attempts>=1);

  // Forged event ID with same UUID and route, revision or kind mismatch:
  // it must NEVER inherit the completed ACK or cause a purge.
  for(const bad of [
    {...first,routes:["/haberler/forged","/haberler","/"]},
    {...first,revision:999},
    {...first,kind:"published"},
    {...first,submissionId:uuid2}
  ]){
   const before={ack:acked,purge:purgeCount,retry:retried};
   await consumeCmsPurgeBatch({messages:[message(bad,6)]},purger,receipts);
   assert.equal(acked,before.ack);assert.equal(purgeCount,before.purge);
   assert.equal(retried,before.retry+1);
  }
  assert.deepEqual(await receipts.verifyEvent({...first,revision:999}),false);
  assert.ok(await receipts.verifyEvent(first));
  await assert.rejects(()=>receipts.claim(uuid1,"0".repeat(64)),/receipt_event_hash_mismatch/);
  await assert.rejects(()=>receipts.status(uuid1,"f".repeat(64)),/receipt_event_hash_mismatch/);
  const missing={...first,eventId:"33333333-3333-4333-8333-333333333333"};
  const before=purgeCount;
  await consumeCmsPurgeBatch({messages:[message(missing)]},purger,receipts);
  assert.equal(purgeCount,before);

  // If the purge succeeds but COMMIT of receipt fails, NEVER ACK.
  // At-least-once purge may safely be repeated on the next Queue delivery.
  const broken={
    ...receipts,
    async complete(){throw Error("synthetic PostgreSQL completion outage")}
  };
  const ackBefore=acked;
  await consumeCmsPurgeBatch({messages:[message(second,3)]},purger,broken);
  assert.equal(acked,ackBefore);assert.equal(await receipts.status(uuid2),"processing");
  await consumeCmsPurgeBatch({messages:[message(second,4)]},purger,receipts);
  assert.equal(acked,ackBefore+1);
  assert.equal(await receipts.status(uuid2,await fingerprintPurgeEvent(second)),"completed");
  const count=purgeCount;
  await consumeCmsPurgeBatch({messages:[message(second)]},async()=>{throw Error("must not purge completed event")},receipts);
  assert.equal(purgeCount,count);
  assert.equal(acked,ackBefore+2);

  const statuses=(await db.query("SELECT count(*)::int AS n FROM cms_purge_receipts WHERE status='completed'")).rows[0].n;
  assert.equal(statuses,2,"only the two durable outbox events may have completed receipts");
  assert.ok(delays.includes(30));
  assert.ok(delays.includes(160),"bounded exponential backoff on delayed invalid event");

  const duplicate=validatePurgeEvent({...first,approved:true,ticket:"INJECTED",routes:[...first.routes,first.routes[0]]});
  assert.equal(Object.hasOwn(duplicate,"approved"),false);
  assert.deepEqual(duplicate.routes,first.routes);
 }finally{
  await db.end();await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");await admin.end();
 }
});
