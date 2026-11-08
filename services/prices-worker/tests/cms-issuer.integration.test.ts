import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import pg from "pg";
import {temporaryCiIssuer,addVerifiedAttestation} from "./fixtures/ci-issuer";
import {createCmsAuthorizedPipeline} from "../src/cms/authorized-pipeline";
import {revokeIssuerAuthority,reconcileInvalidIssuerPublications} from "../src/cms/issuer-revoker";

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw Error("TEST_DATABASE_URL required; must not silently skip");
const schema="tur009_issuer_ci";
const at=new Date("2026-11-07T22:00:00Z");
const draft=slug=>({
  type:"news" as const,slug,
  title:"Synthetic issuer-identity test content "+slug,
  summary:"An intentionally fictional news article used only for issuer revocation and source evidence testing.",
  body:"This fictional article exists only in an ephemeral CI PostgreSQL schema and makes no claims about any actual consumer product, brand, company, license, merchant, person or release.",
  language:"tr",observedAt:"2026-11-07T21:50:00Z",sources:["ci-source-issuer"]
});
test("issuer revocation and rotation immediately deny public view and atomically withdraw with outbox",async()=>{
 const admin=new pg.Pool({connectionString,max:1});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString,options:"-c search_path="+schema,max:4});
 try{
  for(const file of ["0003_content_cms.sql","0004_cms_delivery.sql",
    "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
    "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql"]){
    await db.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  }
  await db.query(
    "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by,reviewed_at) VALUES ('ci-source-issuer','manufacturer','SYNTHETIC_ISSUER_SOURCE_RIGHTS','Synthetic CI source','https://example.org/synthetic-issuer-test',true,'CI Authorized Reviewer',$1)",[at]);
  const pipeline=createCmsAuthorizedPipeline(db,{async send(){}},()=>at);
  async function create(issuerId:string,slug:string){
    const key=temporaryCiIssuer();
    await db.query(
      "INSERT INTO cms_review_authorities(id,active,reviewer_class,public_key_pem) VALUES($1,true,'licensed_verifier',$2)",
      [issuerId,key.publicPem]);
    const record=await pipeline.repository.submit("test-issuer-"+slug,draft(slug));
    for(const type of ["editorial","originality"]){
      await addVerifiedAttestation(db,{submissionId:record.id,revision:1,
        type,authorityId:issuerId,privateKey:key.privateKey,verifiedAt:at});
    }
    const published=await pipeline.process(record.id,1);
    assert.equal(published.state,"published");
    const deps=(await db.query<{attestation_type:string}>(
      "SELECT attestation_type FROM cms_public_issuer_dependencies WHERE submission_id=$1 ORDER BY attestation_type",[record.id])).rows;
    assert.deepEqual(deps.map(x=>x.attestation_type),["editorial","originality"]);
    assert.equal((await db.query("SELECT 1 FROM cms_public_pages WHERE submission_id=$1",[record.id])).rowCount,1);
    return {key,record};
  }
  const a=await create("ci-issuer-revoked","ci-original-signer-article");
  // Reviewer identity is disabled: public view denies immediately.
  await db.query("UPDATE cms_review_authorities SET active=false WHERE id='ci-issuer-revoked'");
  assert.equal((await db.query("SELECT 1 FROM cms_public_pages WHERE submission_id=$1",[a.record.id])).rowCount,0);
  const revoked=await revokeIssuerAuthority(db,"ci-issuer-revoked",
    "SIGNED_ISSUER_COMPROMISED_001","CI Security Officer");
  assert.equal(revoked.withdrawn,1);
  assert.equal((await db.query("SELECT state FROM content_submissions WHERE id=$1",[a.record.id])).rows[0].state,"withdrawn");
  assert.equal((await db.query(
    "SELECT count(*)::int AS n FROM cms_delivery_outbox WHERE submission_id=$1 AND event_kind='withdrawn'",[a.record.id])).rows[0].n,1);
  assert.equal((await revokeIssuerAuthority(db,"ci-issuer-revoked","REPEAT_ISSUER_REVOCATION","CI Security Officer")).withdrawn,0);

  const b=await create("ci-issuer-rotated","ci-rotated-key-article");
  const freshKey=temporaryCiIssuer();
  await db.query("UPDATE cms_review_authorities SET public_key_pem=$1 WHERE id='ci-issuer-rotated'",[freshKey.publicPem]);
  // A new key cannot silently reinterpret old signed editor decisions.
  assert.equal((await db.query("SELECT 1 FROM cms_public_pages WHERE submission_id=$1",[b.record.id])).rowCount,0);
  const fixed=await reconcileInvalidIssuerPublications(db);
  assert.equal(fixed.withdrawn,1);
  assert.equal((await db.query("SELECT state FROM content_submissions WHERE id=$1",[b.record.id])).rows[0].state,"withdrawn");

  const c=await create("ci-issuer-evidence","ci-evidence-invalidated-article");
  await db.query(
    "UPDATE cms_external_attestations SET status='revoked' WHERE submission_id=$1 AND attestation_type='editorial'",[c.record.id]);
  assert.equal((await db.query("SELECT 1 FROM cms_public_pages WHERE submission_id=$1",[c.record.id])).rowCount,0);
  assert.equal((await reconcileInvalidIssuerPublications(db)).withdrawn,1);
  assert.equal((await reconcileInvalidIssuerPublications(db)).withdrawn,0);
  // A signature altered AFTER publication remains non-empty and can still
  // satisfy superficial status checks, but MUST fail immutable exact-byte
  // signature projection before reconciliation.
  const d=await create("ci-issuer-tampered","ci-replaced-signature-article");
  await db.query(
    "UPDATE cms_external_attestations SET signature_base64=$2 WHERE submission_id=$1 AND attestation_type='editorial'",
    [d.record.id,"A".repeat(88)]);
  assert.equal((await db.query(
    "SELECT 1 FROM cms_public_pages WHERE submission_id=$1",[d.record.id])).rowCount,0);
  assert.equal((await reconcileInvalidIssuerPublications(db)).withdrawn,1);
  assert.equal((await db.query(
    "SELECT state FROM content_submissions WHERE id=$1",[d.record.id])).rows[0].state,"withdrawn");

  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_issuer_revocations WHERE authority_id='ci-issuer-revoked'")).rows[0].n,2);
  // Six publish/revoke events are durable and do not leak active content.
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_delivery_outbox")).rows[0].n,8);
 }finally{
  await db.end();
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await admin.end();
 }
});
