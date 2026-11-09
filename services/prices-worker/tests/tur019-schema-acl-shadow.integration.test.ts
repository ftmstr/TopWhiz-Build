import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {fingerprintPurgeEvent} from "../src/cms/cloudflare-adapters.mjs";

const DATABASE=process.env.TEST_DATABASE_URL;
if(!DATABASE)throw Error("TEST_DATABASE_URL required: ephemeral PostgreSQL16 only");
const schema="tur019_schema_acl_ci";
const migrations=[
 "0003_content_cms.sql","0004_cms_delivery.sql",
 "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
 "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
 "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql",
 "0011_cms_queue_receipt_hash.sql","0012_cms_mutation_commit_guard.sql",
 "0013_cms_legacy_receipt_recovery.sql","0014_cms_secdef_authorization.sql",
 "0015_cms_recovery_provenance_acl.sql","0016_cms_outbox_digest_acl_runtime.sql",
 "0017_cms_canonical_route_contract.sql"
];
test("TUR019 PG16 non-owner group CREATE, DEFINER search_path and original digest cannot be shadowed",async()=>{
 const admin=new pg.Pool({connectionString:DATABASE,max:2});
 await admin.query("CREATE SCHEMA "+schema);
 const db=new pg.Pool({connectionString:DATABASE,
  options:"-c search_path="+schema,max:2});
 let roleCreated=false;
 try{
  for(const file of migrations)
   await db.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  await admin.query("CREATE ROLE tw_ci019_untrusted_group NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE");
  roleCreated=true;
  const submission=(await db.query(
   "INSERT INTO content_submissions(external_key,content_type,slug,payload,state) VALUES('ci-tur019-original','news','ci-tur019-original','{}'::jsonb,'pending_review') RETURNING id"
  )).rows[0].id;
  const outbox=(await db.query(
   "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,3,'withdrawn',$2::jsonb) RETURNING *",
   [submission,JSON.stringify(["/haberler/ci-tur019-original","/haberler","/"])]
  )).rows[0];
  const digest=await fingerprintPurgeEvent({
   eventId:outbox.id,submissionId:submission,revision:3,
   kind:"withdrawn",routes:outbox.routes
  });
  assert.equal((await db.query(
   "SELECT cms_canonical_recovery_digest($1::uuid) AS digest",[outbox.id]
  )).rows[0].digest,digest);
  // Must fail even if PUBLIC has zero CREATE: a named group is enough.
  await admin.query("GRANT CREATE ON SCHEMA "+schema+" TO tw_ci019_untrusted_group");
  await assert.rejects(()=>db.query(
   "SELECT cms_canonical_recovery_digest($1::uuid)",[outbox.id]
  ),/cms_recovery_schema_acl_drift/);
  await admin.query("REVOKE CREATE ON SCHEMA "+schema+" FROM tw_ci019_untrusted_group");
  assert.equal((await db.query(
   "SELECT cms_canonical_recovery_digest($1::uuid) AS digest",[outbox.id]
  )).rows[0].digest,digest);
  // Check all SECURITY DEFINER functions introduced by TUR015-018 retain
  // pg_temp last. Do not claim schema owner/superuser tamper is prevented.
  const programs=(await db.query(
   "SELECT proname,prosecdef,proconfig,pg_get_userbyid(proowner) AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname IN ('cms_canonical_recovery_digest','cms_enforce_recovery_outbox_digest','cms_claim_legacy_redrive','cms_validate_recovery_grant_provenance')",
   [schema])).rows;
  assert.equal(programs.length,4);
  for(const fn of programs){
   assert.equal(fn.prosecdef,true);
   assert.ok(fn.proconfig?.includes("search_path=pg_catalog, "+schema+", pg_temp"));
  }
  // Owner-controlled synthetic temp table simulates untrusted shadow object
  // names. Qualifying the target schema's DEFINER body must still select
  // the trusted original outbox, never a temp relation.
  const client=await db.connect();
  try{
   await client.query("CREATE TEMP TABLE cms_delivery_outbox(id uuid,submission_id uuid,revision_no integer,event_kind text,routes jsonb)");
   await client.query(
    "INSERT INTO pg_temp.cms_delivery_outbox VALUES($1,$2,99,'withdrawn','[\"/api/forged\"]'::jsonb)",
    [outbox.id,submission]);
   assert.equal((await client.query(
    "SELECT "+schema+".cms_canonical_recovery_digest($1::uuid) AS digest",
    [outbox.id])).rows[0].digest,digest);
  }finally{client.release()}
  console.log(JSON.stringify({suite:"TUR019_PG_OWNER_ACL_TEMP",
   canonicalDigestChecked:true,nonOwnerGroupCreateDenied:true,
   securityDefinerPinned:4,tempShadowRejected:true,
   schemaOwnerMalice:"NOT_PREVENTED",livePostgres:"NOT_RUN"}));
 }finally{
  await db.end();
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  if(roleCreated)await admin.query("DROP ROLE IF EXISTS tw_ci019_untrusted_group");
  await admin.end();
 }
});
