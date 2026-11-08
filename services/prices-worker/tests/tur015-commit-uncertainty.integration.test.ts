import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {authorizeLegacyReceiptRedrive} from "../src/cms/legacy-receipt-recovery";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";
import {fingerprintPurgeEvent,consumeCmsPurgeBatch} from "../src/cms/cloudflare-adapters.mjs";
import {replayDeadLetters} from "../src/cms/dlq-redrive.mjs";
const URI=process.env.TEST_DATABASE_URL;
if(!URI)throw Error("TEST_DATABASE_URL required");
const schema="tur015_ambiguous_commit_ci";
const ticket="CI-INDEPENDENT-RECOVERY-TICKET-015";
const actor="CI Independent Security Officer";
test("Queue acceptance before SQL COMMIT, uncertain COMMIT ACK, active lease and repeated DLQ never falsely mark purged",async()=>{
 const admin=new pg.Pool({connectionString:URI,max:1});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:URI,options:"-c search_path="+schema,max:14});
 try{
  for(const file of [
   "0003_content_cms.sql","0004_cms_delivery.sql","0005_cms_trusted_attestations.sql",
   "0006_cms_security.sql","0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
   "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql",
   "0011_cms_queue_receipt_hash.sql","0012_cms_mutation_commit_guard.sql",
   "0013_cms_legacy_receipt_recovery.sql","0014_cms_secdef_authorization.sql"
  ])await db.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  const submission=(await db.query(
   "INSERT INTO content_submissions(external_key,content_type,slug,payload,state) VALUES('ci-tur015-uncertainty','news','ci-tur015-uncertainty','{}'::jsonb,'pending_review') RETURNING id"
  )).rows[0].id;
  async function legacy(revision:number){
   const row=(await db.query(
     "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,$2,'withdrawn',$3::jsonb) RETURNING *",
     [submission,revision,JSON.stringify(["/haberler/ci-tur015-uncertainty","/haberler","/"])] )).rows[0];
   const event={eventId:row.id,submissionId:row.submission_id,
    revision:row.revision_no,kind:row.event_kind,routes:row.routes};
   const digest=await fingerprintPurgeEvent(event);
   await db.query(
    "INSERT INTO cms_purge_receipts(event_id,status,claim_token,lease_until,attempts,completed_at,event_sha256) VALUES($1,'completed',$2,now()-interval '1 hour',1,now(),NULL)",
    [row.id,randomUUID()]);
   await db.query(
    "INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,ticket_ref,operator_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
    [row.id,digest,ticket,actor]);
   return {event,digest};
  }
  const verifier=async()=>({approved:true,ticket,operator:actor});
  const audits:any[]=[];
  const audit=async(x:any)=>{audits.push(x)};
  const store=makeReceiptStore(async(sql,args)=>(await db.query(sql,args)).rows);
  let purges=0,acks=0,retries=0;
  const event1=await legacy(2);
  let pending:Promise<any>|undefined;
  const ports={
   verifyOperatorTicket:verifier,auditReplay:audit,
   originQueue:{async send(item:any){
    // This task starts while receipt-reset transaction is UNCOMMITTED.
    // It must not ACK from a prior NULL-hash completed receipt.
    pending=consumeCmsPurgeBatch({
      messages:[{body:item,attempts:1,ack(){acks++},retry(){retries++}}]
    },async()=>{purges++},store);
   }}
  };
  const first=await authorizeLegacyReceiptRedrive(db,event1.event.eventId,ports);
  assert.equal(first.acknowledgeDlq,true);
  await pending;
  assert.equal(acks,1);assert.equal(purges,1);
  assert.equal(await store.status(event1.event.eventId,event1.digest),"completed");
  assert.equal((await db.query("SELECT consumed_at IS NOT NULL AS yes FROM cms_legacy_recovery_authorizations WHERE event_id=$1",[event1.event.eventId])).rows[0].yes,true);

  // Second event: queue accepts original immutable event and the DB
  // actually commits, but the caller loses the COMMIT acknowledgement.
  // Never ACK in this situation: inspect durable receipt/audit first.
  const event2=await legacy(3);
  const received=[];
  const ackLostPool:any={connect:async()=>{
   const client=await db.connect();
   return {
    release:()=>client.release(),
    query:async(sql:string,args?:any[])=>{
     if(sql==="COMMIT"){
      await client.query("COMMIT");
      throw Error("synthetic_commit_ack_lost_after_success");
     }
     return client.query(sql,args);
    }
   };
  }};
  await assert.rejects(()=>authorizeLegacyReceiptRedrive(ackLostPool,event2.event.eventId,{
   verifyOperatorTicket:verifier,auditReplay:audit,
   originQueue:{async send(event:any){received.push(event)}}
  }),/synthetic_commit_ack_lost_after_success/);
  assert.equal(received.length,1,"the Queue really accepted the event");
  assert.equal((await db.query(
    "SELECT count(*)::int AS n FROM cms_legacy_receipt_recovery_audit WHERE event_id=$1",
    [event2.event.eventId])).rows[0].n,1);
  assert.equal(await store.status(event2.event.eventId,event2.digest),"missing");
  assert.equal(acks,1,"DLQ must NOT ACK on a lost COMMIT response");
  await assert.rejects(()=>authorizeLegacyReceiptRedrive(db,event2.event.eventId,{
   verifyOperatorTicket:verifier,auditReplay:audit,
   originQueue:{async send(){throw Error("already committed — no duplicate reset")}}
  }),/legacy_recovery_receipt_not_eligible/);
  await consumeCmsPurgeBatch({messages:[{body:received[0],attempts:2,
    ack(){acks++},retry(){retries++}}]},async()=>{purges++},store);
  assert.equal(acks,2);assert.equal(purges,2);
  assert.equal(await store.status(event2.event.eventId,event2.digest),"completed");
  const dlq=await replayDeadLetters({messages:[{body:event2.event,
    ack(){acks++},retry(){retries++}}]},{
    verifyOperatorTicket:verifier,
    originQueue:{async send(){throw Error("completed must not re-enqueue")}},
    receipts:store,auditReplay:audit
  });
  assert.equal(dlq.previouslyCompleted,1);
  assert.equal(acks,3);

  // Processing receipt: active lease cannot be confused with completed.
  const row=(await db.query(
   "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,4,'withdrawn',$2::jsonb) RETURNING *",
   [submission,JSON.stringify(["/haberler/ci-tur015-uncertainty","/haberler","/"])]
  )).rows[0];
  const active={eventId:row.id,submissionId:submission,revision:4,
   kind:"withdrawn",routes:row.routes};
  const activeDigest=await fingerprintPurgeEvent(active);
  await db.query(
   "INSERT INTO cms_purge_receipts(event_id,status,claim_token,lease_until,attempts,event_sha256) VALUES($1,'processing',$2,now()+interval '2 minutes',1,$3)",
   [active.eventId,randomUUID(),activeDigest]);
  const activeDLQ=await replayDeadLetters({messages:[{body:active,ack(){acks++},retry(){retries++}}]},{
   verifyOperatorTicket:verifier,originQueue:{async send(){throw Error("active lease should block re-send")}},
   receipts:store,auditReplay:audit
  });
  assert.equal(activeDLQ.retried,1);
  assert.equal(await store.status(active.eventId,activeDigest),"processing");
  assert.equal(acks,3);
  assert.equal((await db.query(
   "SELECT count(*)::int AS n FROM cms_legacy_receipt_recovery_audit")).rows[0].n,2);
  console.log(JSON.stringify({suite:"TUR015_QUEUE_COMMIT_UNCERTAINTY",
    legacyRecoveries:2,successfulPurgeReceipts:2,
    preCommitConcurrentConsumer:true,commitResponseLostAfterDurableCommit:true,
    activeLeasePreserved:true,purges,acks,retries}));
 }finally{
  await db.end();
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await admin.end();
 }
});
