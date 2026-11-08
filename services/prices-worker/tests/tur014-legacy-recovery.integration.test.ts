import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID,randomBytes} from "node:crypto";
import pg from "pg";
import {authorizeLegacyReceiptRedrive} from "../src/cms/legacy-receipt-recovery";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";
import {fingerprintPurgeEvent,consumeCmsPurgeBatch} from "../src/cms/cloudflare-adapters.mjs";
import {replayDeadLetters} from "../src/cms/dlq-redrive.mjs";
const uri=process.env.TEST_DATABASE_URL;
if(!uri)throw Error("TEST_DATABASE_URL required");
const schema="tur014_legacy_recovery_ci";
const uuid="77777777-7777-4777-8777-777777777777";
test("NULL-hash completed receipts are quarantined; audited, independently approved redrive triggers fresh durable purge",async()=>{
 const admin=new pg.Pool({connectionString:uri,max:2});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:uri,options:"-c search_path="+schema,max:18});
 const credentials=[];
 try{
  for(const f of [
   "0003_content_cms.sql","0004_cms_delivery.sql","0005_cms_trusted_attestations.sql",
   "0006_cms_security.sql","0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
   "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql",
   "0011_cms_queue_receipt_hash.sql","0012_cms_mutation_commit_guard.sql",
   "0013_cms_legacy_receipt_recovery.sql"
  ])await db.query(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
  await admin.query(readFileSync(new URL("../security/cms_roles.sql",import.meta.url),"utf8")
   .replaceAll("__TOPWHIZ_SCHEMA__",schema));
  for(const role of ["reader","queue_consumer","legacy_recovery"]){
   const login="tw_ci014_"+role,password=randomBytes(24).toString("hex");
   await admin.query("CREATE ROLE "+login+" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
   await admin.query("GRANT tw_cms_"+role+" TO "+login+" WITH INHERIT TRUE");
   credentials.push({role,login,password});
  }
  async function withLogin(role:string,sql:string,args:any[]=[]){
   const x=credentials.find(c=>c.role===role)!;
   const url=new URL(uri!);url.username=x.login;url.password=x.password;
   const c=new pg.Client({connectionString:url.toString(),options:"-c search_path="+schema});
   await c.connect();
   try{
    assert.equal((await c.query("SELECT current_user AS actor")).rows[0].actor,x.login);
    return await c.query(sql,args);
   }finally{await c.end()}
  }
  const submission=(await db.query(
    "INSERT INTO content_submissions(external_key,content_type,slug,payload,state) VALUES('ci-tur014-queue','news','ci-tur014-queue','{}'::jsonb,'pending_review') RETURNING id"
  )).rows[0].id;
  const build=async(i:number)=>{
   const outbox=(await db.query(
    "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,$2,'withdrawn',$3::jsonb) RETURNING *",
    [submission,i+2,JSON.stringify(["/haberler/ci-tur014-queue","/haberler","/"])] )).rows[0];
   await db.query(
    "INSERT INTO cms_purge_receipts(event_id,status,claim_token,lease_until,attempts,completed_at,event_sha256) VALUES($1,'completed',$2,now()-interval '2 hours',1,now(),NULL)",
    [outbox.id,randomUUID()]);
   return {eventId:outbox.id,submissionId:outbox.submission_id,revision:outbox.revision_no,
    kind:outbox.event_kind,routes:outbox.routes};
  };
  const event=await build(0),receipt=makeReceiptStore(async(sql,args)=>(await db.query(sql,args)).rows);
  const digest=await fingerprintPurgeEvent(event);
  await assert.rejects(()=>receipt.status(event.eventId,digest),/legacy_receipt_requires_independent_recovery/);
  await assert.rejects(()=>receipt.claim(event.eventId,digest),/legacy_receipt_requires_independent_recovery/);
  await assert.rejects(()=>withLogin("reader","SELECT * FROM cms_purge_receipts"),/permission denied/i);
  await assert.rejects(()=>withLogin("queue_consumer","DELETE FROM cms_purge_receipts"),/permission denied/i);
  await assert.rejects(()=>withLogin("legacy_recovery","DELETE FROM cms_purge_receipts"),/permission denied/i);
  await assert.rejects(()=>withLogin("legacy_recovery","UPDATE cms_trusted_sources SET rights_approved=false"),/permission denied/i);
  await assert.rejects(()=>withLogin("reader",
    "SELECT cms_claim_legacy_redrive($1::uuid,$2::varchar,$3::varchar,$4::varchar)",
    [event.eventId,digest,"Fake Actor","FAKE_TEST_TICKET_999"]),/permission denied/i);
  // Positive capability: an isolated broker session can only invoke
  // the constrained function, never arbitrary receipt deletes.
  assert.equal((await withLogin("legacy_recovery",
    "SELECT has_function_privilege(current_user,$1,'EXECUTE') AS granted",
    [schema+".cms_claim_legacy_redrive(uuid,character varying,character varying,character varying)"])).rows[0].granted,true);
  let sends=0,acks=0,retries=0,purges=0;
  const originalMessage={body:event,ack(){acks++},retry(){retries++}};
  const operator=async()=>({approved:true,ticket:"CI_INDEPENDENT_OPERATOR_TICKET_0001",operator:"Independent CI Operator"});
  const auditEvents:any[]=[];
  const audit=async (x:any)=>auditEvents.push(x);
  const externalQueue={async send(x:any){sends++;assert.deepEqual(x,event)}};
  // This DLQ event MUST NOT be ACKed merely because old row says completed.
  const before=await replayDeadLetters({messages:[originalMessage]},{
   verifyOperatorTicket:operator,originQueue:externalQueue,receipts:receipt,auditReplay:audit
  });
  assert.deepEqual(before,{resent:0,previouslyCompleted:0,retried:1});
  assert.equal(acks,0);assert.equal(sends,0);

  await assert.rejects(()=>authorizeLegacyReceiptRedrive(db,event.eventId,{
   verifyOperatorTicket:async()=>({approved:false,ticket:"FAKE_TICKET",operator:"none"}),
   auditReplay:audit,originQueue:externalQueue
  }),/legacy_recovery_independent_approval_denied/);
  await assert.rejects(()=>authorizeLegacyReceiptRedrive(db,event.eventId,{
   verifyOperatorTicket:operator,auditReplay:async()=>{throw Error("CI audit disabled")},
   originQueue:externalQueue
  }),/CI audit disabled/);
  await assert.rejects(()=>authorizeLegacyReceiptRedrive(db,event.eventId,{
   verifyOperatorTicket:operator,auditReplay:audit,
   originQueue:{async send(){throw Error("CI original Queue offline")}}
  }),/CI original Queue offline/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_legacy_receipt_recovery_audit")).rows[0].n,0);
  assert.equal(await receipt.status(event.eventId),"completed");
  assert.equal(sends,0);

  const recovered=await authorizeLegacyReceiptRedrive(db,event.eventId,{
   verifyOperatorTicket:operator,auditReplay:audit,originQueue:externalQueue
  });
  assert.equal(recovered.queued,true);assert.equal(recovered.acknowledgeDlq,true);
  assert.equal(recovered.canonicalDigest,digest);
  assert.equal(sends,1);
  assert.equal(await receipt.status(event.eventId,digest),"missing");
  const auditRow=(await db.query(
   "SELECT event_sha256,operator_id,outcome FROM cms_legacy_receipt_recovery_audit WHERE event_id=$1",
   [event.eventId])).rows[0];
  assert.equal(auditRow.event_sha256,digest);
  assert.equal(auditRow.outcome,"replay_enqueued");
  await assert.rejects(()=>authorizeLegacyReceiptRedrive(db,event.eventId,{
   verifyOperatorTicket:operator,auditReplay:audit,originQueue:externalQueue
  }),/legacy_recovery_receipt_not_eligible/);

  await consumeCmsPurgeBatch({messages:[{body:event,attempts:1,ack(){acks++},retry(){retries++}}]},
   async()=>{purges++},receipt);
  assert.equal(purges,1);assert.equal(acks,1);
  assert.equal(await receipt.status(event.eventId,digest),"completed");
  const done=await replayDeadLetters({messages:[originalMessage]},{
   verifyOperatorTicket:operator,originQueue:externalQueue,receipts:receipt,auditReplay:audit
  });
  assert.equal(done.previouslyCompleted,1);
  assert.equal(sends,1);
  assert.equal(acks,2);

  // Twenty concurrently authorized attempts on a second legacy receipt:
  // exactly one may reset it; all others fail closed under row-level lock.
  const second=await build(1);
  const attempts=await Promise.allSettled(Array.from({length:20},()=>
   authorizeLegacyReceiptRedrive(db,second.eventId,{
    verifyOperatorTicket:operator,auditReplay:audit,
    originQueue:{async send(x:any){assert.equal(x.eventId,second.eventId);sends++}}
   })));
  assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(attempts.filter(r=>r.status==="rejected").length,19);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_legacy_receipt_recovery_audit")).rows[0].n,2);
  assert.equal(sends,2);
 }finally{
  await db.end();
  for(const x of credentials.reverse()){
   await admin.query("REVOKE tw_cms_"+x.role+" FROM "+x.login);
   await admin.query("DROP ROLE IF EXISTS "+x.login);
  }
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await admin.end();
 }
});
