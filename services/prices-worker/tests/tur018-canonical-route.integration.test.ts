import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomBytes,randomUUID} from "node:crypto";
import pg from "pg";
import {validatePurgeEvent,fingerprintPurgeEvent} from "../src/cms/cloudflare-adapters.mjs";

// Real disposable PG16, fictional original outbox only. No Cloudflare,
// credentials, production migrations, operator identity or live events.
const URL_DB=process.env.TEST_DATABASE_URL;
if(!URL_DB)throw Error("TEST_DATABASE_URL required");
const schema="tur018_route_contract_ci";
const files=[
 "0003_content_cms.sql","0004_cms_delivery.sql",
 "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
 "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
 "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql",
 "0011_cms_queue_receipt_hash.sql","0012_cms_mutation_commit_guard.sql",
 "0013_cms_legacy_receipt_recovery.sql","0014_cms_secdef_authorization.sql",
 "0015_cms_recovery_provenance_acl.sql","0016_cms_outbox_digest_acl_runtime.sql"
];
test("TUR018 canonical SHA respects JS safe-route limits, old forged outbox denial and late schema CREATE drift",async()=>{
 const admin=new pg.Pool({connectionString:URL_DB,max:2});
 await admin.query("CREATE SCHEMA "+schema);
 const db=new pg.Pool({connectionString:URL_DB,options:"-c search_path="+schema,max:8});
 const logins=[];
 try{
  for(const file of files)await db.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  await admin.query(readFileSync(new URL("../security/cms_roles.sql",import.meta.url),"utf8")
   .replaceAll("__TOPWHIZ_SCHEMA__",schema));
  for(const [name,role] of [["tw_ci018_issuer","tw_cms_recovery_authorizer"],["tw_ci018_broker","tw_cms_legacy_recovery"],["tw_ci018_reader","tw_cms_reader"]]){
   const password=randomBytes(24).toString("hex");
   await admin.query("CREATE ROLE "+name+" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
   await admin.query("GRANT "+role+" TO "+name+" WITH INHERIT TRUE");
   logins.push({name,role,password});
  }
  async function as(name:string,sql:string,args:any[]=[]){
   const row=logins.find(x=>x.name===name)!;
   const url=new URL(URL_DB!);url.username=name;url.password=row.password;
   const client=new pg.Client({connectionString:url.toString(),options:"-c search_path="+schema});
   await client.connect();
   try{return await client.query(sql,args)}finally{await client.end()}
  }
  const submission=(await db.query(
   "INSERT INTO content_submissions(external_key,content_type,slug,payload,state) VALUES('ci-tur018-original','news','ci-tur018-original','{}'::jsonb,'pending_review') RETURNING id"
  )).rows[0].id;
  let rev=1;
  async function make(routes:any){
   const revision=++rev;
   const eventRow=(await db.query(
    "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,$2,'withdrawn',$3::jsonb) RETURNING *",
    [submission,revision,JSON.stringify(routes)])).rows[0];
   return {eventId:eventRow.id,submissionId:submission,revision,
    kind:"withdrawn",routes};
  }
  const good=[
   ["/","/haberler","/telefonlar","/karsilastir"],
   ["/haberler/gunluk-test","/haberler/gunluk-test","/telefonlar/ci-model-2"],
   [],
   ["/telefonlar/ci-model-2","/","/haberler","/"]
  ];
  const invalid=[
   ["/haberler/%2e%2e"],
   ["/haberler/ci?utm=1"],
   ["/telefonlar/CI-UPPER"],
   ["/haberler/ci--double"],
   ["/haberler/ci/extra"],
   ["/haberler/teşt"],
   ["/api/internal"],
   ["/haberler/"+"a".repeat(250)],
   ["/","/haberler","/telefonlar","/karsilastir",
    "/haberler/a","/haberler/b","/haberler/c","/haberler/d",
    "/haberler/e","/haberler/f","/haberler/g"],
   ["/",123],
   ["/",{"path":"/haberler"}]
  ];
  const all=await Promise.all([...good,...invalid].map(make));
  // Before migration a syntactically valid event SHA could be computed
  // for an *unsafe* original outbox. Previously minted malicious approval
  // must not be grandfathered at claim time after migration.
  const forged=all[good.length];
  const forgedDigest=(await db.query(
   "SELECT cms_canonical_recovery_digest($1::uuid) AS digest",[forged.eventId]
  )).rows[0].digest;
  const ticket="CI-ORIGINAL-OUTBOX-APPROVAL-018",officer="Independent CI Officer";
  const grant="INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,operator_id,ticket_ref,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')";
  await as("tw_ci018_issuer",grant,[forged.eventId,forgedDigest,officer,ticket]);
  await db.query(
   "INSERT INTO cms_purge_receipts(event_id,status,claim_token,lease_until,attempts,completed_at,event_sha256) VALUES($1,'completed',$2,now()-interval '2 hours',1,now(),NULL)",
   [forged.eventId,randomUUID()]);
  const sql=readFileSync(new URL("../migrations/0017_cms_canonical_route_contract.sql",import.meta.url),"utf8");
  // Migration must fail if any named role gains schema CREATE after 0016.
  await admin.query("GRANT CREATE ON SCHEMA "+schema+" TO tw_ci018_reader");
  await assert.rejects(()=>db.query(sql),/tur018_untrusted_cms_schema_acl/);
  await db.query("ROLLBACK");
  await admin.query("REVOKE CREATE ON SCHEMA "+schema+" FROM tw_ci018_reader");
  await db.query(sql);
  let approved=0,denied=0;
  for(const [i,event] of all.entries()){
   if(i<good.length){
    const expected=await fingerprintPurgeEvent(validatePurgeEvent(event));
    const computed=(await db.query("SELECT cms_canonical_recovery_digest($1::uuid) AS digest",
     [event.eventId])).rows[0].digest;
    assert.equal(computed,expected,"SQL and JS canonical payload agree");
    approved++;
   }else{
    assert.throws(()=>validatePurgeEvent(event),/invalid_cache_event/);
    await assert.rejects(()=>db.query(
     "SELECT cms_canonical_recovery_digest($1::uuid)",[event.eventId]),
     /cms_recovery_original_outbox_invalid/);
    denied++;
   }
  }
  const claim="SELECT cms_claim_legacy_redrive($1::uuid,$2::varchar,$3::varchar,$4::varchar)";
  await assert.rejects(()=>as("tw_ci018_broker",claim,
   [forged.eventId,forgedDigest,officer,ticket]),
   /cms_recovery_original_outbox_invalid/);
  assert.equal((await db.query(
   "SELECT count(*)::int AS n FROM cms_legacy_receipt_recovery_audit WHERE event_id=$1",
   [forged.eventId])).rows[0].n,0);
  assert.equal((await db.query(
   "SELECT consumed_at FROM cms_legacy_recovery_authorizations WHERE event_id=$1",
   [forged.eventId])).rows[0].consumed_at,null);
  await assert.rejects(()=>as("tw_ci018_issuer",grant,
   [all[good.length+1].eventId,"a".repeat(64),officer,ticket]),
   /cms_recovery_original_outbox_invalid/);
  await assert.rejects(()=>as("tw_ci018_reader",
   "SELECT cms_canonical_recovery_digest($1::uuid)",[all[0].eventId]),
   /permission denied/i);
  assert.equal((await db.query(
   "SELECT count(*)::int AS n FROM cms_purge_receipts WHERE event_id=$1 AND status='completed' AND event_sha256 IS NULL",
   [forged.eventId])).rows[0].n,1,"legacy NULL-hash cannot be misread as purge proof");
  console.log(JSON.stringify({suite:"TUR018_SQL_ROUTE_CANONICAL",
   accepted:approved,rejected:denied,retroactiveMaliciousGrantDenied:true,
   schemaDriftBlocked:true,unauthorizedReaderDenied:true,realQueue:"NOT_RUN"}));
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
