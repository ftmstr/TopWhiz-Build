import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomBytes,randomUUID} from "node:crypto";
import pg from "pg";
import {fingerprintPurgeEvent,consumeCmsPurgeBatch} from "../src/cms/cloudflare-adapters.mjs";
import {replayDeadLetters} from "../src/cms/dlq-redrive.mjs";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";

const URI=process.env.TEST_DATABASE_URL;
if(!URI)throw Error("TEST_DATABASE_URL required: real disposable PG16 only");
const schema="tur017_outbox_digest_ci";
const migrations=[
 "0003_content_cms.sql","0004_cms_delivery.sql",
 "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
 "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
 "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql",
 "0011_cms_queue_receipt_hash.sql","0012_cms_mutation_commit_guard.sql",
 "0013_cms_legacy_receipt_recovery.sql","0014_cms_secdef_authorization.sql",
 "0015_cms_recovery_provenance_acl.sql"
];

test("TUR017 canonical SQL outbox hash, post-install schema ACL drift, parallel broker and DLQ lease are fail-closed",async()=>{
 const admin=new pg.Pool({connectionString:URI,max:2});
 await admin.query("CREATE SCHEMA "+schema);
 const db=new pg.Pool({connectionString:URI,options:"-c search_path="+schema,max:20});
 const logins:{name:string;role:string;password:string}[]=[];
 try{
  for(const f of migrations)
   await db.query(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
  await admin.query(readFileSync(new URL("../security/cms_roles.sql",import.meta.url),"utf8")
   .replaceAll("__TOPWHIZ_SCHEMA__",schema));
  for(const [name,role] of [
   ["tw_ci017_authorizer","tw_cms_recovery_authorizer"],
   ["tw_ci017_broker","tw_cms_legacy_recovery"],
   ["tw_ci017_acl_probe","tw_cms_reader"]
  ]){
   const password=randomBytes(24).toString("hex");
   await admin.query("CREATE ROLE "+name+" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
   await admin.query("GRANT "+role+" TO "+name+" WITH INHERIT TRUE");
   logins.push({name,role,password});
  }
  async function as(name:string,sql:string,args:any[]=[]){
   const x=logins.find(x=>x.name===name)!;
   const url=new URL(URI!);url.username=name;url.password=x.password;
   const c=new pg.Client({connectionString:url.toString(),options:"-c search_path="+schema});
   await c.connect();
   try{
    assert.equal((await c.query("SELECT session_user AS who")).rows[0].who,name);
    return await c.query(sql,args);
   }finally{await c.end()}
  }
  const sub=(await db.query(
   "INSERT INTO content_submissions(external_key,content_type,slug,payload,state) VALUES('ci-tur017-auth','news','ci-tur017-auth','{}'::jsonb,'pending_review') RETURNING id"
  )).rows[0].id;
  async function makeEvent(revision:number,routes:string[]){
   const outbox=(await db.query(
    "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,$2,'withdrawn',$3::jsonb) RETURNING *",
    [sub,revision,JSON.stringify(routes)])).rows[0];
   const event={eventId:outbox.id,submissionId:sub,revision,kind:"withdrawn",routes};
   const digest=await fingerprintPurgeEvent(event);
   await db.query(
    "INSERT INTO cms_purge_receipts(event_id,status,claim_token,lease_until,attempts,completed_at,event_sha256) VALUES($1,'completed',$2,now()-interval '1 hour',1,now(),NULL)",
    [event.eventId,randomUUID()]);
   return {event,digest};
  }
  const routes=["/haberler/ci-tur017-auth","/haberler","/"];
  const legacy=await makeEvent(2,routes);
  const valid=await makeEvent(3,[...routes,"/haberler"]); // original JSON has duplicate
  const active=await makeEvent(4,routes);
  const ticket="CI-APPROVED-TUR017-ORIGINAL",actor="Separate CI Security Operator";
  const insert="INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,operator_id,ticket_ref,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')";
  const claim="SELECT cms_claim_legacy_redrive($1::uuid,$2::varchar,$3::varchar,$4::varchar) AS ok";

  // Pre-0016, an independently entitled grant issuer could manufacture
  // a random digest even for a legitimate UUID. Preserve this old grant
  // as an adversarial migration fixture: retroactive protection matters.
  await as("tw_ci017_authorizer",insert,
   [legacy.event.eventId,"f".repeat(64),actor,ticket]);
  await db.query(readFileSync(new URL(
   "../migrations/0016_cms_outbox_digest_acl_runtime.sql",import.meta.url),"utf8"));

  for(const entry of [legacy,valid,active]){
   const pgHash=(await db.query(
    "SELECT cms_canonical_recovery_digest($1::uuid) AS digest",[entry.event.eventId]
   )).rows[0].digest;
   assert.equal(pgHash,entry.digest,"JS and PostgreSQL canonical UUID/revision/routes must match");
  }
  await assert.rejects(()=>as("tw_ci017_broker",claim,
   [legacy.event.eventId,"f".repeat(64),actor,ticket]),
   /cms_recovery_outbox_digest_mismatch/);
  assert.equal((await db.query(
   "SELECT count(*)::int AS n FROM cms_legacy_receipt_recovery_audit"
  )).rows[0].n,0);
  assert.equal((await db.query(
   "SELECT event_sha256 FROM cms_purge_receipts WHERE event_id=$1",
   [legacy.event.eventId])).rows[0].event_sha256,null);

  await assert.rejects(()=>as("tw_ci017_authorizer",insert,
   [valid.event.eventId,"a".repeat(64),actor,ticket]),
   /cms_recovery_outbox_digest_mismatch/);

  // Even when the migration was initially run in a correct schema,
  // an owner may later GRANT CREATE to a named non-owner role.
  // Every new grant and every consumption must detect this ACL drift.
  await admin.query("GRANT CREATE ON SCHEMA "+schema+" TO tw_ci017_acl_probe");
  await assert.rejects(()=>as("tw_ci017_authorizer",insert,
   [valid.event.eventId,valid.digest,actor,ticket]),
   /cms_recovery_schema_acl_drift/);
  await admin.query("REVOKE CREATE ON SCHEMA "+schema+" FROM tw_ci017_acl_probe");
  await as("tw_ci017_authorizer",insert,
   [valid.event.eventId,valid.digest,actor,ticket]);
  await admin.query("GRANT CREATE ON SCHEMA "+schema+" TO tw_ci017_acl_probe");
  await assert.rejects(()=>as("tw_ci017_broker",claim,
   [valid.event.eventId,valid.digest,actor,ticket]),
   /cms_recovery_schema_acl_drift/);
  assert.equal((await db.query(
   "SELECT consumed_at IS NULL AS unconsumed FROM cms_legacy_recovery_authorizations WHERE event_id=$1",
   [valid.event.eventId])).rows[0].unconsumed,true);
  await admin.query("REVOKE CREATE ON SCHEMA "+schema+" FROM tw_ci017_acl_probe");

  const attempts=await Promise.allSettled(Array.from({length:12},()=>
   as("tw_ci017_broker",claim,[valid.event.eventId,valid.digest,actor,ticket])));
  assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1,
   "one and only one broker can claim a grant under 12-way contention");
  assert.equal(attempts.filter(x=>x.status==="rejected").length,11);
  assert.equal((await db.query(
   "SELECT count(*)::int AS n FROM cms_legacy_receipt_recovery_audit"
  )).rows[0].n,1);
  assert.equal((await db.query(
   "SELECT count(*)::int AS n FROM cms_purge_receipts WHERE event_id=$1",
   [valid.event.eventId])).rows[0].n,0);
  const receipts=makeReceiptStore(async(sql,args)=>(await db.query(sql,args)).rows);
  let sends=0,acks=0,retries=0,purges=0;
  const original=valid.event;
  const ops={
   verifyOperatorTicket:async()=>({approved:true,ticket,operator:actor}),
   receipts,
   auditReplay:async()=>{},
   originQueue:{async send(item:any){
    assert.deepEqual(item,{...original,routes:[...new Set(original.routes)]});
    sends++;
   }}
  };
  // Separate batches model parallel DLQ operators; at-least-once may
  // accept duplicates. The durable receipt must still bound purging.
  const batch=await Promise.all(Array.from({length:8},()=>
   replayDeadLetters({messages:[{body:original,
    ack(){acks++},retry(){retries++}}]},ops)));
  assert.ok(batch.every(x=>x.resent===1));
  assert.equal(sends,8);
  const stale={...original,routes:["/haberler/forged","/haberler","/"]};
  const forged=await replayDeadLetters({messages:[{body:stale,
   ack(){acks++},retry(){retries++}}]},ops);
  assert.equal(forged.retried,1);
  assert.equal(sends,8,"forged routes cannot get into origin Queue");
  let completed=0;
  await Promise.all(Array.from({length:8},()=>consumeCmsPurgeBatch({
   messages:[{body:original,attempts:1,
    ack(){completed++},retry(){retries++}}]
  },async()=>{purges++},receipts)));
  assert.equal(purges,1,"parallel DLQ duplicates must have only one purge claim");
  assert.equal(await receipts.status(original.eventId,valid.digest),"completed");
  assert.ok(completed>=1);
  // A processing lease is never a completed old receipt and may not be
  // force-reset merely because a valid independent grant exists.
  await db.query(
   "UPDATE cms_purge_receipts SET status='processing',completed_at=NULL,event_sha256=$2,lease_until=now()+interval '2 minutes' WHERE event_id=$1",
   [active.event.eventId,active.digest]);
  await as("tw_ci017_authorizer",insert,
   [active.event.eventId,active.digest,actor,ticket]);
  await assert.rejects(()=>as("tw_ci017_broker",claim,
   [active.event.eventId,active.digest,actor,ticket]),
   /legacy_receipt_not_eligible_for_redrive/);
  assert.equal(await receipts.status(active.event.eventId,active.digest),"processing");
  const parallelActive=await Promise.all(Array.from({length:5},()=>
   replayDeadLetters({messages:[{body:active.event,
    ack(){acks++},retry(){retries++}}]},ops)));
  assert.ok(parallelActive.every(x=>x.retried===1));
  assert.equal(sends,8);
  const pinned=(await db.query(
   "SELECT proname,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prosecdef AND proname IN ('cms_canonical_recovery_digest','cms_enforce_recovery_outbox_digest')",
   [schema])).rows;
  assert.equal(pinned.length,2);
  assert.ok(pinned.every(x=>x.proconfig?.includes("search_path=pg_catalog, "+schema+", pg_temp")));
  console.log(JSON.stringify({suite:"TUR017_SQL_CANONICAL_OUTBOX_RECOVERY",
   canonicalHashes:3,forgedHistoricGrantDenied:true,postMigrationAclDriftDenied:true,
   parallelBrokerClaims:12,successfulClaims:1,parallelDlqBatches:8,
   queueRedeliveries:sends,durablePurges:purges,activeLeaseDenied:true,
   liveQueue:"NOT_RUN",realCloudflarePurge:"NOT_RUN"}));
 }finally{
  await db.end();
  for(const x of logins.reverse()){
   await admin.query("REVOKE "+x.role+" FROM "+x.name);
   await admin.query("DROP ROLE IF EXISTS "+x.name);
  }
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await admin.end();
 }
});
