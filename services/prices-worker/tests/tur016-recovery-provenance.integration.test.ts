import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomBytes,randomUUID} from "node:crypto";
import pg from "pg";
import {fingerprintPurgeEvent} from "../src/cms/cloudflare-adapters.mjs";

// Real isolated PostgreSQL 16 — synthetic credentials, no live queue,
// R2, CDN, external issuer or production permissions.
const URI=process.env.TEST_DATABASE_URL;
if(!URI)throw Error("TEST_DATABASE_URL required");
const schema="tur016_provenance_acl_ci";
const files=[
 "0003_content_cms.sql","0004_cms_delivery.sql",
 "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
 "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
 "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql",
 "0011_cms_queue_receipt_hash.sql","0012_cms_mutation_commit_guard.sql",
 "0013_cms_legacy_receipt_recovery.sql","0014_cms_secdef_authorization.sql"
];
test("TUR016 rejects non-owner CREATE and forged grant issuer/time while preserving legitimate two-role recovery",async()=>{
 const admin=new pg.Pool({connectionString:URI,max:2});
 await admin.query("CREATE SCHEMA "+schema);
 const db=new pg.Pool({connectionString:URI,options:"-c search_path="+schema,max:1});
 const identities:{name:string;role:string;password:string}[]=[];
 try{
  for(const name of files){
   await db.query(readFileSync(new URL("../migrations/"+name,import.meta.url),"utf8"));
  }
  await admin.query(readFileSync(new URL("../security/cms_roles.sql",import.meta.url),"utf8")
   .replaceAll("__TOPWHIZ_SCHEMA__",schema));
  for(const [name,role] of [
   ["tw_ci016_auth_login","tw_cms_recovery_authorizer"],
   ["tw_ci016_broker_login","tw_cms_legacy_recovery"],
   ["tw_ci016_schema_probe","tw_cms_reader"]
  ]){
   const password=randomBytes(24).toString("hex");
   await admin.query("CREATE ROLE "+name+" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
   await admin.query("GRANT "+role+" TO "+name+" WITH INHERIT TRUE");
   identities.push({name,role,password});
  }
  const migration=readFileSync(
    new URL("../migrations/0015_cms_recovery_provenance_acl.sql",import.meta.url),"utf8");

  // TUR015 only checked PUBLIC CREATE, not explicit CREATE granted to
  // other roles. A direct named-role grant must now block the migration.
  await admin.query("GRANT CREATE ON SCHEMA "+schema+" TO tw_ci016_schema_probe");
  await assert.rejects(()=>db.query(migration),
   /cms_schema_create_granted_to_untrusted_role/);
  await db.query("ROLLBACK");
  assert.equal((await db.query(
   "SELECT to_regprocedure('cms_validate_recovery_grant_provenance()') IS NULL AS absent"
  )).rows[0].absent,true,"failed transaction must leave no half-migrated trigger");
  await admin.query("REVOKE CREATE ON SCHEMA "+schema+" FROM tw_ci016_schema_probe");
  await db.query(migration);
  const acl=(await db.query(
   "SELECT n.nspowner,a.grantee,a.privilege_type FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname=$1 AND a.privilege_type='CREATE'",
   [schema])).rows;
  assert.ok(acl.every(row=>row.grantee===row.nspowner));

  async function as(name:string,sql:string,args:any[]=[]){
   const x=identities.find(x=>x.name===name)!;
   const addr=new URL(URI!);addr.username=name;addr.password=x.password;
   const client=new pg.Client({connectionString:addr.toString(),options:"-c search_path="+schema});
   await client.connect();
   try{
    assert.equal((await client.query("SELECT session_user AS who")).rows[0].who,name);
    return await client.query(sql,args);
   }finally{await client.end()}
  }

  const sub=(await db.query(
   "INSERT INTO content_submissions(external_key,content_type,slug,payload,state) VALUES('ci-tur016-provenance','news','ci-tur016-provenance','{}'::jsonb,'pending_review') RETURNING id"
  )).rows[0].id;
  const original=(await db.query(
   "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,2,'withdrawn',$2::jsonb) RETURNING *",
   [sub,JSON.stringify(["/haberler/ci-tur016-provenance","/haberler","/"])]
  )).rows[0];
  const event={eventId:original.id,submissionId:original.submission_id,
   revision:original.revision_no,kind:original.event_kind,routes:original.routes};
  const digest=await fingerprintPurgeEvent(event);
  await db.query(
   "INSERT INTO cms_purge_receipts(event_id,status,claim_token,lease_until,attempts,completed_at,event_sha256) VALUES($1,'completed',$2,now()-interval '1 hour',1,now(),NULL)",
   [event.eventId,randomUUID()]);
  const ticket="CI-TUR016-INDEPENDENT-APPROVAL",operator="CI Separate Officer";
  const args=[event.eventId,digest,operator,ticket];
  const insert="INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,operator_id,ticket_ref,expires_at)";
  const claim="SELECT cms_claim_legacy_redrive($1::uuid,$2::varchar,$3::varchar,$4::varchar) AS ok";

  // The authorizer had INSERT and could previously impersonate any
  // issued_by and invent historical timestamps or pre-consumed grants.
  await assert.rejects(()=>as("tw_ci016_auth_login",
    "INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,operator_id,ticket_ref,issued_by,expires_at) VALUES($1,$2,$3,$4,'tw_cms_schema_owner',now()+interval '10 minutes')",args),
   /cms_recovery_issuer_identity_spoof/);
  await assert.rejects(()=>as("tw_ci016_auth_login",
    "INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,operator_id,ticket_ref,issued_at,expires_at) VALUES($1,$2,$3,$4,now()-interval '5 minutes',now()+interval '9 minutes')",args),
   /cms_recovery_grant_timestamp_or_consumption_spoof/);
  await assert.rejects(()=>as("tw_ci016_auth_login",
    "INSERT INTO cms_legacy_recovery_authorizations(event_id,event_sha256,operator_id,ticket_ref,consumed_at,expires_at) VALUES($1,$2,$3,$4,now(),now()+interval '10 minutes')",args),
   /cms_recovery_grant_timestamp_or_consumption_spoof/);
  await assert.rejects(()=>as("tw_ci016_auth_login",
    insert+" VALUES($1,$2,$3,$4,now()+interval '20 minutes')",args),
   /cms_recovery_grant_expiry_invalid|check constraint/);
  assert.equal((await db.query(
   "SELECT count(*)::int AS n FROM cms_legacy_recovery_authorizations"
  )).rows[0].n,0);
  await assert.rejects(()=>as("tw_ci016_broker_login",
    insert+" VALUES($1,$2,$3,$4,now()+interval '10 minutes')",args),
   /permission denied/i);

  await as("tw_ci016_auth_login",
   insert+" VALUES($1,$2,$3,$4,now()+interval '10 minutes')",args);
  const stamped=(await db.query(
   "SELECT issued_by::text AS issuer,issued_at,consumed_at,expires_at FROM cms_legacy_recovery_authorizations WHERE event_id=$1",
   [event.eventId])).rows[0];
  assert.equal(stamped.issuer,"tw_ci016_auth_login");
  assert.equal(stamped.consumed_at,null);
  assert.ok(stamped.expires_at>stamped.issued_at);
  assert.ok(stamped.expires_at-stamped.issued_at<=15*60*1000);

  await assert.rejects(()=>as("tw_ci016_broker_login",claim,
   [event.eventId,"e".repeat(64),operator,ticket]),
   /independent_recovery_grant_required/);
  await assert.rejects(()=>as("tw_ci016_broker_login",claim,
   [event.eventId,digest,operator,"WRONG-TICKET-016"]),
   /independent_recovery_grant_required/);
  assert.equal((await as("tw_ci016_broker_login",claim,args)).rows[0].ok,true);
  assert.equal((await db.query(
   "SELECT count(*)::int AS n FROM cms_legacy_receipt_recovery_audit WHERE event_id=$1",
   [event.eventId])).rows[0].n,1);
  assert.equal((await db.query(
   "SELECT count(*)::int AS n FROM cms_purge_receipts WHERE event_id=$1",
   [event.eventId])).rows[0].n,0);
  await assert.rejects(()=>as("tw_ci016_broker_login",claim,args),
   /independent_recovery_grant_required/);
  console.log(JSON.stringify({suite:"TUR016_RECOVERY_PROVENANCE_SCHEMA_ACL",
   nonOwnerCreateRejected:true,issuerSpoofRejected:true,
   timestampSpoofRejected:true,preconsumedRejected:true,
   brokerCannotMintGrant:true,durableRecoveryAudits:1,
   liveCloudflare:"NOT_RUN"}));
 }finally{
  await db.end();
  for(const x of identities.reverse()){
   await admin.query("REVOKE "+x.role+" FROM "+x.name);
   await admin.query("DROP ROLE IF EXISTS "+x.name);
  }
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await admin.end();
 }
});
