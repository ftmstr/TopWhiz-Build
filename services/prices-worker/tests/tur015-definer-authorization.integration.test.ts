import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {randomBytes,randomUUID} from "node:crypto";
import pg from "pg";
import {authorizeLegacyReceiptRedrive} from "../src/cms/legacy-receipt-recovery";
import {fingerprintPurgeEvent,consumeCmsPurgeBatch} from "../src/cms/cloudflare-adapters.mjs";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";
const URI=process.env.TEST_DATABASE_URL;
if(!URI)throw Error("TEST_DATABASE_URL required");
const schema="tur015_hardening_ci";
test("SECURITY DEFINER must defeat pg_temp table spoof; separate recovery authorizer and broker cannot impersonate",async()=>{
 const admin=new pg.Pool({connectionString:URI,max:2});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:URI,options:"-c search_path="+schema,max:12});
 const logins=[];
 try{
  for(const file of [
   "0003_content_cms.sql","0004_cms_delivery.sql",
   "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
   "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
   "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql",
   "0011_cms_queue_receipt_hash.sql","0012_cms_mutation_commit_guard.sql",
   "0013_cms_legacy_receipt_recovery.sql","0014_cms_secdef_authorization.sql"
  ])await db.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  await admin.query(readFileSync(new URL("../security/cms_roles.sql",import.meta.url),"utf8")
    .replaceAll("__TOPWHIZ_SCHEMA__",schema));
  const functions=(await db.query(
   "SELECT p.proname,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prosecdef AND p.proname LIKE 'cms_%'",
   [schema])).rows;
  assert.ok(functions.length>=5,"All CMS sensitive functions must be security definer");
  for(const p of functions){
   const search=(p.proconfig??[]).find(x=>x.startsWith("search_path="));
   assert.equal(search,"search_path=pg_catalog, "+schema+", pg_temp","untrusted pg_temp may never shadow CMS objects in "+p.proname);
  }
  for(const role of ["legacy_recovery","recovery_authorizer","reader"]){
   const login="tw_ci015_"+role,password=randomBytes(24).toString("hex");
   await admin.query("CREATE ROLE "+login+" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
   await admin.query("GRANT tw_cms_"+role+" TO "+login+" WITH INHERIT TRUE");
   logins.push({role,login,password});
  }
  async function as(role:string,command:(c:pg.Client)=>Promise<any>){
   const identity=logins.find(x=>x.role===role)!;
   const address=new URL(URI!);address.username=identity.login;address.password=identity.password;
   const client=new pg.Client({connectionString:address.toString(),options:"-c search_path="+schema});
   await client.connect();
   try{
    assert.equal((await client.query("SELECT current_user AS who")).rows[0].who,identity.login);
    return await command(client);
   }finally{await client.end()}
  }
  const sub=(await db.query(
   "INSERT INTO content_submissions(external_key,content_type,slug,payload,state) VALUES('ci-tur015-hardening','news','ci-tur015-hardening','{}'::jsonb,'pending_review') RETURNING id"
  )).rows[0].id;
  const eventDb=(await db.query(
   "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,2,'withdrawn',$2::jsonb) RETURNING *",
   [sub,JSON.stringify(["/haberler/ci-tur015-hardening","/haberler","/"])]
  )).rows[0];
  const event={eventId:eventDb.id,submissionId:sub,revision:2,kind:"withdrawn",
   routes:["/haberler/ci-tur015-hardening","/haberler","/"]};
  const digest=await fingerprintPurgeEvent(event);
  await db.query(
   "INSERT INTO cms_purge_receipts(event_id,status,claim_token,lease_until,attempts,completed_at,event_sha256) VALUES($1,'completed',$2,now()-interval '1 hour',1,now(),NULL)",
   [event.eventId,randomUUID()]);
  const ticket="CI-INDEPENDENT-TICKET-015",operator="CI Independently Authenticated Officer";
  const statement="SELECT cms_claim_legacy_redrive($1::uuid,$2::varchar,$3::varchar,$4::varchar)";
  const args=[event.eventId,digest,operator,ticket];
  await assert.rejects(()=>as("legacy_recovery",c=>c.query(statement,args)),
   /independent_recovery_grant_required/);
  await assert.rejects(()=>as("reader",c=>c.query(statement,args)),/permission denied/i);
  await assert.rejects(()=>as("legacy_recovery",c=>c.query(
   "INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,operator_id,ticket_ref,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
   args)),/permission denied/i);
  await assert.rejects(()=>as("recovery_authorizer",c=>c.query(statement,args)),
   /permission denied/i);
  await assert.rejects(()=>as("recovery_authorizer",c=>c.query(
   "DELETE FROM cms_purge_receipts WHERE event_id=$1",[event.eventId])),/permission denied/i);
  // Authorizer has only insert on the single-use authorization ledger.
  await as("recovery_authorizer",c=>c.query(
   "INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,operator_id,ticket_ref,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
   args));
  await assert.rejects(()=>as("legacy_recovery",c=>c.query(statement,
   [event.eventId,"f".repeat(64),operator,ticket])),/independent_recovery_grant_required/);
  await assert.rejects(()=>as("legacy_recovery",c=>c.query(statement,
   [event.eventId,digest,operator,"FORGED-SECOND-TICKET"])),/independent_recovery_grant_required/);
  await assert.rejects(()=>as("recovery_authorizer",c=>c.query(
   "UPDATE cms_legacy_recovery_authorizations SET ticket_ref='FORGED' WHERE event_id=$1",[event.eventId])),/permission denied/i);

  // Stronger than a string check: create a fake pg_temp table with a
  // matching name, then CALL as a real broker login; function resolves
  // trust-owned CMS schema instead of attacker-controlled pg_temp.
  await as("legacy_recovery",async c=>{
    await c.query("CREATE TEMP TABLE cms_purge_receipts(event_id uuid,status text,event_sha256 text)");
    await c.query("INSERT INTO cms_purge_receipts VALUES($1,'processing',$2)",[event.eventId,digest]);
    const out=await c.query(statement,args);
    assert.equal(out.rows[0].cms_claim_legacy_redrive,true);
  });
  const record=(await db.query(
   "SELECT a.event_sha256,a.outcome,z.consumed_at FROM cms_legacy_receipt_recovery_audit a JOIN cms_legacy_recovery_authorizations z USING(event_id) WHERE a.event_id=$1",
   [event.eventId])).rows[0];
  assert.equal(record.event_sha256,digest);
  assert.equal(record.outcome,"replay_enqueued");
  assert.ok(record.consumed_at);
  assert.equal((await db.query("SELECT 1 FROM cms_purge_receipts WHERE event_id=$1",[event.eventId])).rowCount,0);
  await assert.rejects(()=>as("legacy_recovery",c=>c.query(statement,args)),
   /independent_recovery_grant_required/);
  await assert.rejects(()=>as("recovery_authorizer",c=>c.query(
   "INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,operator_id,ticket_ref,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
   args)),/duplicate key/);
  // Newly delivered event now passes the exact old-outbox+digest gate.
  const receipts=makeReceiptStore(async(sql,args)=>(await db.query(sql,args)).rows);
  let purged=0,acked=0;
  await consumeCmsPurgeBatch({messages:[{body:event,attempts:1,ack(){acked++},retry(){throw Error("unexpected_retry")}}]},
   async()=>{purged++},receipts);
  assert.equal(purged,1);assert.equal(acked,1);
  assert.equal(await receipts.status(event.eventId,digest),"completed");
 }finally{
  await db.end();
  for(const row of logins.reverse()){
   await admin.query("REVOKE tw_cms_"+row.role+" FROM "+row.login);
   await admin.query("DROP ROLE IF EXISTS "+row.login);
  }
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await admin.end();
 }
});
