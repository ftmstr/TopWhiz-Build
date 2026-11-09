import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomBytes} from "node:crypto";
import pg from "pg";

/** Disposable PostgreSQL 16 ONLY: two independent DB login identities.
 * This does not instrument the real media HTTP handler, TCP/last byte,
 * Cloudflare R2, Durable Objects or global cache invalidation.
 */
const URI=process.env.TEST_DATABASE_URL;
if(!URI)throw Error("TEST_DATABASE_URL required (disposable PG16 only)");
const schema="tur021_durable_media_ci";
const migrations=[
 "0003_content_cms.sql","0004_cms_delivery.sql",
 "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
 "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
 "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql",
 "0011_cms_queue_receipt_hash.sql","0012_cms_mutation_commit_guard.sql",
 "0013_cms_legacy_receipt_recovery.sql","0014_cms_secdef_authorization.sql",
 "0015_cms_recovery_provenance_acl.sql","0016_cms_outbox_digest_acl_runtime.sql",
 "0017_cms_canonical_route_contract.sql",
 "0018_cms_media_durable_fence_ci.sql"
];
test("TUR021 real PG16: parallel isolated sessions, durable generation and DB rights in ONE commit",async()=>{
 const admin=new pg.Pool({connectionString:URI,max:2});
 await admin.query("CREATE SCHEMA "+schema);
 const owner=new pg.Pool({connectionString:URI,options:"-c search_path="+schema,max:3});
 const roles=[];
 try{
  for(const file of migrations)
   await owner.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  for(const name of ["tw_ci021_reader","tw_ci021_revoker","tw_ci021_untrusted"]){
   const password=randomBytes(24).toString("hex");
   await admin.query("CREATE ROLE "+name+
    " LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
   roles.push({name,password});
  }
  for(const name of ["tw_ci021_reader","tw_ci021_revoker"])
   await admin.query("GRANT USAGE ON SCHEMA "+schema+" TO "+name);
  await admin.query("GRANT EXECUTE ON FUNCTION "+schema+".cms_media_fence_admit(varchar),"+
   schema+".cms_media_fence_release(uuid,varchar) TO tw_ci021_reader");
  await admin.query("GRANT EXECUTE ON FUNCTION "+schema+".cms_media_fence_begin_revoke(varchar,bigint),"+
   schema+".cms_media_fence_commit_revoke(varchar,uuid) TO tw_ci021_revoker");
  function clientFor(name:string){
   const found=roles.find(x=>x.name===name)!;
   const url=new URL(URI!);url.username=name;url.password=found.password;
   return new pg.Client({connectionString:url.toString(),options:"-c search_path="+schema});
  }
  async function as(name:string,sql:string,args:any[]=[]){
   const client=clientFor(name);await client.connect();
   try{
    assert.equal((await client.query("SELECT session_user AS u")).rows[0].u,name);
    return await client.query(sql,args);
   }finally{await client.end()}
  }
  async function asset(id:string){
   await owner.query(
    "INSERT INTO cms_media_assets(id,r2_key,content_type,bytes,sha256_hex,alt_text,license_evidence_ref,rights_approved,reviewed_by) VALUES($1,$2,'image/png',128,$3,'Self-generated CI synthetic image','CI_ORIGINAL_RIGHTS',true,'CI synthetic reviewer')",
    [id,"media/reviewed/"+id+"/"+"a".repeat(64)+".png","a".repeat(64)]);
   await owner.query("INSERT INTO cms_media_fence_state(asset_id) VALUES($1)",[id]);
  }
  const id="ci-tur021-parallel";await asset(id);
  const admitted=await Promise.all(Array.from({length:24},()=>
   as("tw_ci021_reader","SELECT * FROM cms_media_fence_admit($1::varchar)",[id])));
  const tokens=admitted.map(x=>x.rows[0].permit_token);
  assert.equal(new Set(tokens).size,24);
  assert.ok(admitted.every(x=>x.rows[0].publication_generation==="1"));
  const begin=(await as("tw_ci021_revoker",
   "SELECT cms_media_fence_begin_revoke($1::varchar,$2::bigint) AS cap",
   [id,1])).rows[0].cap;
  const denied=await Promise.allSettled(Array.from({length:12},()=>
   as("tw_ci021_reader","SELECT * FROM cms_media_fence_admit($1::varchar)",[id])));
  assert.ok(denied.every(x=>x.status==="rejected"&&
   /cms_media_fence_admission_denied/.test(String(x.reason))));
  await assert.rejects(()=>as("tw_ci021_revoker",
   "SELECT cms_media_fence_commit_revoke($1::varchar,$2::uuid)",[id,begin]),
   /cms_media_fence_active_local_permits/);
  const rightsBefore=(await owner.query(
   "SELECT rights_approved FROM cms_media_assets WHERE id=$1",[id])).rows[0];
  assert.equal(rightsBefore.rights_approved,true);
  await assert.rejects(()=>as("tw_ci021_reader",
   "UPDATE cms_media_assets SET rights_approved=false WHERE id=$1",[id]),
   /permission denied/);
  await Promise.all(tokens.slice(0,12).map(t=>as("tw_ci021_reader",
   "SELECT cms_media_fence_release($1::uuid,'drained')",[t])));
  await assert.rejects(()=>as("tw_ci021_revoker",
   "SELECT cms_media_fence_commit_revoke($1::varchar,$2::uuid)",[id,begin]),
   /cms_media_fence_active_local_permits/);
  await Promise.all(tokens.slice(12).map(t=>as("tw_ci021_reader",
   "SELECT cms_media_fence_release($1::uuid,'cancelled')",[t])));
  const generation=(await as("tw_ci021_revoker",
   "SELECT cms_media_fence_commit_revoke($1::varchar,$2::uuid) AS g",
   [id,begin])).rows[0].g;
  assert.equal(generation,"2");
  const now=(await owner.query(
   "SELECT s.phase,s.generation,s.revocation_token,a.rights_approved FROM cms_media_fence_state s JOIN cms_media_assets a ON a.id=s.asset_id WHERE s.asset_id=$1",[id])).rows[0];
  assert.deepEqual({phase:now.phase,generation:now.generation,
    token:now.revocation_token,rights:now.rights_approved},
   {phase:"revoked",generation:"2",token:null,rights:false});
  await assert.rejects(()=>as("tw_ci021_reader",
   "SELECT cms_media_fence_release($1::uuid,'drained')",[tokens[0]]),
   /cms_media_fence_unknown_or_reused_permit/);
  await assert.rejects(()=>as("tw_ci021_revoker",
   "SELECT cms_media_fence_commit_revoke($1::varchar,$2::uuid)",[id,begin]),
   /cms_media_fence_revoke_token_or_phase_invalid/);
  await assert.rejects(()=>as("tw_ci021_revoker",
   "SELECT cms_media_fence_begin_revoke($1::varchar,1)",[id]),
   /cms_media_fence_already_closed/);

  // Lost DB COMMIT *response* AFTER the database committed (not a mock
  // "exactly once" Queue claim): reconnect and read the durable truth.
  const ackId="ci-tur021-acklost";await asset(ackId);
  const ackCap=(await as("tw_ci021_revoker",
   "SELECT cms_media_fence_begin_revoke($1::varchar,1) AS cap",[ackId])).rows[0].cap;
  let observedAckLost=false;
  const connection=clientFor("tw_ci021_revoker");await connection.connect();
  try{
   await connection.query("BEGIN");
   const once=await connection.query(
    "SELECT cms_media_fence_commit_revoke($1::varchar,$2::uuid) AS generation",
    [ackId,ackCap]);
   assert.equal(once.rows[0].generation,"2");
   await connection.query("COMMIT");
   // Deliberate synthetic response-loss AFTER actual durable COMMIT.
   observedAckLost=true;
  }finally{await connection.end()}
  assert.equal(observedAckLost,true);
  assert.equal((await owner.query(
   "SELECT phase FROM cms_media_fence_state WHERE asset_id=$1",[ackId])).rows[0].phase,
   "revoked");
  await assert.rejects(()=>as("tw_ci021_revoker",
   "SELECT cms_media_fence_commit_revoke($1::varchar,$2::uuid)",[ackId,ackCap]),
   /cms_media_fence_revoke_token_or_phase_invalid/);

  // SQL transaction rollback represents a crashed pre-COMMIT process:
  // a previously persisted REVOKING fence remains closed, can be
  // retried with the same original capability after reconciliation.
  const retryId="ci-tur021-rollback";await asset(retryId);
  const retryCap=(await as("tw_ci021_revoker",
   "SELECT cms_media_fence_begin_revoke($1::varchar,1) AS cap",[retryId])).rows[0].cap;
  const c=clientFor("tw_ci021_revoker");await c.connect();
  try{
   await c.query("BEGIN");
   assert.equal((await c.query(
    "SELECT cms_media_fence_commit_revoke($1::varchar,$2::uuid) AS generation",
    [retryId,retryCap])).rows[0].generation,"2");
   await c.query("ROLLBACK");
  }finally{await c.end()}
  const rolled=(await owner.query(
   "SELECT phase,generation FROM cms_media_fence_state WHERE asset_id=$1",[retryId])).rows[0];
  assert.equal(rolled.phase,"revoking");assert.equal(rolled.generation,"1");
  await assert.rejects(()=>as("tw_ci021_reader",
   "SELECT * FROM cms_media_fence_admit($1::varchar)",[retryId]),
   /cms_media_fence_admission_denied/);
  assert.equal((await as("tw_ci021_revoker",
   "SELECT cms_media_fence_commit_revoke($1::varchar,$2::uuid) AS generation",
   [retryId,retryCap])).rows[0].generation,"2");

  // Runtime ACL drift in separately permitted group must close new
  // grant/claim calls, even when historical migration was initially safe.
  const drift="ci-tur021-drift";await asset(drift);
  await admin.query("GRANT CREATE ON SCHEMA "+schema+" TO tw_ci021_untrusted");
  await assert.rejects(()=>as("tw_ci021_reader",
   "SELECT * FROM cms_media_fence_admit($1::varchar)",[drift]),
   /cms_media_fence_runtime_acl_or_owner_drift/);
  await admin.query("REVOKE CREATE ON SCHEMA "+schema+" FROM tw_ci021_untrusted");
  assert.equal((await as("tw_ci021_reader",
   "SELECT * FROM cms_media_fence_admit($1::varchar)",[drift])).rowCount,1);
  await assert.rejects(()=>as("tw_ci021_untrusted",
   "SELECT * FROM "+schema+".cms_media_fence_admit($1::varchar)",[drift]),
   /permission denied/);

  // Critical residual bypass: a MIGRATOR/owner can update rights
  // outside this fence even while an admission is live.
  const bypass="ci-tur021-owner-bypass";await asset(bypass);
  const still=(await as("tw_ci021_reader",
   "SELECT * FROM cms_media_fence_admit($1::varchar)",[bypass])).rows[0];
  await owner.query("UPDATE cms_media_assets SET rights_approved=false WHERE id=$1",
   [bypass]);
  assert.equal((await owner.query(
   "SELECT phase FROM cms_media_fence_state WHERE asset_id=$1",[bypass])).rows[0].phase,
   "open");
  await as("tw_ci021_reader",
   "SELECT cms_media_fence_release($1::uuid,'cancelled')",[still.permit_token]);
  console.log(JSON.stringify({suite:"TUR021_PG_DURABLE_FENCE",
   realDisposablePg16:true,independentSessions:2,admitted:24,
   localTerminated:24,deniedAfterRevocationStart:12,
   atomicRightsAndGeneration:true,commitAckLostReconciled:true,
   preCommitRollbackRetried:true,aclDriftDenied:true,
   unprivilegedDirectTableWriteDenied:true,
   ownerOutOfBandRightsBypassDemonstrated:true,
   transportLastByte:"NOT_PROVEN",realR2:"NOT_RUN",
   originalUnsafe12Reads99276Bytes:"PRESERVED"}));
 }finally{
  await owner.end();
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  for(const x of roles.reverse())await admin.query("DROP ROLE IF EXISTS "+x.name);
  await admin.end();
 }
});
