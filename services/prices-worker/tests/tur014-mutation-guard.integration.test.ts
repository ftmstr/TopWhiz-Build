import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import pg from "pg";
import {CmsRepository} from "../src/cms/repository";
import {revokeLicensedResource} from "../src/cms/rights-revoker";
import {revokeIssuerAuthority} from "../src/cms/issuer-revoker";
import {createCmsAuthorizedPipeline} from "../src/cms/authorized-pipeline";
import {temporaryCiIssuer,addVerifiedAttestation} from "./fixtures/ci-issuer";
import {publicCmsDetailSql} from "../src/cms/public-sql.mjs";
const url=process.env.TEST_DATABASE_URL;
if(!url)throw Error("TEST_DATABASE_URL mandatory; no skipped security assertions");
const schema="tur014_mutation_guard_ci";
const now=new Date();
function article(slug:string,source:string,coverMediaId?:string){
 return {type:"news" as const,slug,
 title:"CI mutation security test for "+slug,
 summary:"This entirely invented article validates PostgreSQL transactional permission barriers.",
 body:"A fictional original paragraph in an isolated PostgreSQL 16 test. This text does not describe any real event, customer, mobile device, brand, offer, commercial terms, source licensing arrangement, actual price or photograph. It is never publicly published.",
 language:"tr",observedAt:"2026-11-08T08:00:00Z",sources:[source],
 ...(coverMediaId?{coverMediaId,mediaAlt:"Test-only original synthetic image"}:{})
 };
}
test("deferred COMMIT gate rejects un-audited source/media/issuer/evidence mutations; legitimate revokers commit",async()=>{
 const admin=new pg.Pool({connectionString:url,max:1});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:url,options:"-c search_path="+schema,max:12});
 try{
  for(const f of [
   "0003_content_cms.sql","0004_cms_delivery.sql","0005_cms_trusted_attestations.sql",
   "0006_cms_security.sql","0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
   "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql","0011_cms_queue_receipt_hash.sql",
   "0012_cms_mutation_commit_guard.sql","0013_cms_legacy_receipt_recovery.sql"
  ])await db.query(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
  async function source(id:string){
   await db.query("INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES($1,'manufacturer','CI_ORIGINAL_ARTICLE_RIGHTS','Fake Synthetic Source','https://example.org/test-2026',true,'Independent CI Rights Officer')",[id]);
  }
  await source("ci-tur014-source");
  await source("ci-tur014-issuer-source");
  await source("ci-tur014-media-source");
  const repo=new CmsRepository(db);
  async function manual(id:string){
   await db.query("INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author) VALUES($1,1,true,true,true,true,'Independent CI Reviewer','CI Fictional Editor')",[id]);
  }
  async function publishManual(external:string,payload:any){
   const row=await repo.submit(external,payload);await manual(row.id);
   assert.equal((await repo.publish(row.id,1,now)).state,"published");
   return row.id;
  }
  const sourceId=await publishManual("ci-tur014-source-record",article("ci-tur014-source-article","ci-tur014-source"));
  assert.equal((await db.query(publicCmsDetailSql,["news","ci-tur014-source-article"])).rowCount,1);
  await assert.rejects(()=>db.query("UPDATE cms_trusted_sources SET source_url='https://example.org/forged' WHERE id='ci-tur014-source'"),
   /cms_source_evidence_is_immutable/);
  await assert.rejects(()=>db.query("UPDATE cms_trusted_sources SET rights_approved=false WHERE id='ci-tur014-source'"),
    /cms_unfenced_sensitive_mutation_requires_withdrawal_outbox/);
  assert.equal((await db.query("SELECT rights_approved FROM cms_trusted_sources WHERE id='ci-tur014-source'")).rows[0].rights_approved,true);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_mutation_guard_ledger")).rows[0].n,0);
  assert.equal((await revokeLicensedResource(db,"source","ci-tur014-source",
    "CI_SOURCE_LICENSE_TERMINATED","Independent CI Rights Officer")).withdrawn,1);
  assert.equal((await db.query(publicCmsDetailSql,["news","ci-tur014-source-article"])).rowCount,0);
  const guard=(await db.query("SELECT expected_revision,resource_kind,login_actor FROM cms_mutation_guard_ledger WHERE submission_id=$1",[sourceId])).rows[0];
  assert.equal(guard.expected_revision,2);assert.equal(guard.resource_kind,"source");
  assert.equal((await db.query("SELECT event_kind,revision_no FROM cms_delivery_outbox WHERE submission_id=$1 ORDER BY revision_no DESC LIMIT 1",[sourceId])).rows[0].event_kind,"withdrawn");
  await assert.rejects(()=>db.query("UPDATE cms_trusted_sources SET rights_approved=true WHERE id='ci-tur014-source'"),
   /revoked_license_cannot_be_automatically_reapproved/);

  // Separate second article uses independently created signed evidence.
  const issuer=temporaryCiIssuer();
  await db.query("INSERT INTO cms_review_authorities(id,active,reviewer_class,public_key_pem) VALUES('ci-tur014-signer',true,'licensed_verifier',$1)",[issuer.publicPem]);
  const row=await repo.submit("ci-tur014-signer-article",article("ci-tur014-signed-article","ci-tur014-issuer-source"));
  for(const kind of ["editorial","originality"]){
    await addVerifiedAttestation(db,{submissionId:row.id,revision:1,type:kind,
     authorityId:"ci-tur014-signer",privateKey:issuer.privateKey,verifiedAt:now});
  }
  const pipeline=createCmsAuthorizedPipeline(db,{async send(){}},()=>now);
  assert.equal((await pipeline.process(row.id,1)).state,"published");
  await assert.rejects(()=>db.query("UPDATE cms_review_authorities SET active=false WHERE id='ci-tur014-signer'"),
   /cms_unfenced_sensitive_mutation_requires_withdrawal_outbox/);
  await assert.rejects(()=>db.query("UPDATE cms_review_authorities SET reviewer_class='human' WHERE id='ci-tur014-signer'"),
   /cms_issuer_identity_metadata_immutable/);
  await assert.rejects(()=>db.query("UPDATE cms_external_attestations SET evidence_ref='CI_FORGED_EVIDENCE_REF' WHERE submission_id=$1",[row.id]),
   /cms_attestation_binding_immutable/);
  await assert.rejects(()=>db.query("UPDATE cms_external_attestations SET status='revoked' WHERE submission_id=$1",[row.id]),
   /cms_unfenced_sensitive_mutation_requires_withdrawal_outbox/);
  assert.equal((await db.query(publicCmsDetailSql,["news","ci-tur014-signed-article"])).rowCount,1);
  assert.equal((await revokeIssuerAuthority(db,"ci-tur014-signer",
   "CI_SIGNING_KEY_EXPLICITLY_REVOKED","Independent CI Security Controller")).withdrawn,1);
  assert.equal((await db.query(publicCmsDetailSql,["news","ci-tur014-signed-article"])).rowCount,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_mutation_guard_ledger WHERE resource_kind='issuer'")).rows[0].n,1);
  await assert.rejects(()=>db.query("UPDATE cms_review_authorities SET active=true WHERE id='ci-tur014-signer'"),
   /revoked_issuer_cannot_be_automatically_reapproved/);

  // Third content contains a wholly synthetic, placeholder R2 object:
  // DB reference licensing can be revoked, no real R2 account or image.
  await db.query(
   "INSERT INTO cms_media_assets(id,r2_key,content_type,bytes,sha256_hex,alt_text,license_evidence_ref,rights_approved,reviewed_by) VALUES('ci-tur014-img','media/reviewed/ci-tur014-img/original-ci.png','image/png',1024,$1,'Self generated CI picture','CI_GENERATED_RIGHTS_ONLY',true,'Independent CI Image Reviewer')",
   ["a".repeat(64)]);
  const mediaId=await publishManual("ci-tur014-media-article",article("ci-tur014-media-article","ci-tur014-media-source","ci-tur014-img"));
  await assert.rejects(()=>db.query("UPDATE cms_media_assets SET sha256_hex=$1 WHERE id='ci-tur014-img'",["f".repeat(64)]),
   /cms_media_license_or_digest_is_immutable/);
  await assert.rejects(()=>db.query("UPDATE cms_media_assets SET rights_approved=false WHERE id='ci-tur014-img'"),
   /cms_unfenced_sensitive_mutation_requires_withdrawal_outbox/);
  assert.equal((await revokeLicensedResource(db,"media","ci-tur014-img",
   "CI_MEDIA_RIGHTS_REVOKED_TEST","Independent CI Image Reviewer")).withdrawn,1);
  assert.equal((await db.query(publicCmsDetailSql,["news","ci-tur014-media-article"])).rowCount,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_mutation_guard_ledger WHERE submission_id=$1 AND resource_kind='media'",[mediaId])).rows[0].n,1);

  // Even an unrestricted database owner is blocked from deleting and
  // truncating protected rights/issuer rows in an ordinary transaction.
  await assert.rejects(()=>db.query("DELETE FROM cms_trusted_sources WHERE id='ci-tur014-source'"),
   /cms_protected_rights_row_cannot_be_deleted_or_truncated/);
  await assert.rejects(()=>db.query("TRUNCATE cms_review_authorities CASCADE"),
   /cms_protected_rights_row_cannot_be_deleted_or_truncated/);
  const all=(await db.query("SELECT resource_kind,expected_revision FROM cms_mutation_guard_ledger")).rows;
  assert.equal(all.length,3);
  assert.ok(all.every(r=>r.expected_revision===2));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages")).rows[0].n,0);
 }finally{
   await db.end();
   await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
   await admin.end();
 }
});
