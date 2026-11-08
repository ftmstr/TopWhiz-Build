import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";
import { CmsRepository } from "../src/cms/repository";

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw Error("TEST_DATABASE_URL required; CMS integration cannot silently skip");
const when=new Date("2026-11-07T20:30:00Z");
const text=(
  "Bu içerik yalnızca sentetik PostgreSQL entegrasyon testi içindir. "+
  "Gerçek bir cihaz, kullanıcıya açık haber veya lisanslı kaynak olduğunu iddia etmez. "+
  "Karantina, hak denetimi ve atomik yayınlama sonuçları test edilir."
);
function news(title="Tamamen sentetik teknoloji haberi: ilk sürüm"){
  return {
    type:"news" as const,slug:"sentetik-teknoloji-haberi",
    title,summary:"Bu tamamen kurgu metin, yayın işleminin güvenlik kapılarını ve veri sürümlerini test eder.",
    body:text,language:"tr",observedAt:"2026-11-07T20:00:00Z",
    sources:["test-manufacturer-source"],coverMediaId:"test-approved-hero"
  };
}
test("Postgres 16 transactions: pending -> approved -> published -> revised -> withdrawn; durable outbox",async()=>{
  const admin=new pg.Pool({connectionString,max:2});
  await admin.query("CREATE SCHEMA IF NOT EXISTS tur006_cms_test");
  const pool=new pg.Pool({connectionString,options:"-c search_path=tur006_cms_test",max:3});
  const cms=new CmsRepository(pool);
  try{
    for(const file of ["0003_content_cms.sql","0004_cms_delivery.sql","0005_cms_trusted_attestations.sql","0006_cms_security.sql","0008_cms_issuer_lifecycle.sql"]){
      await pool.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
    }
    const first=await cms.submit("test-intake-key-v1",news());
    assert.equal(first.state,"pending_review");
    const same=await cms.submit("test-intake-key-v1",news());
    assert.equal(same.id,first.id);assert.equal(same.replay,true);
    await assert.rejects(
      ()=>cms.submit("test-intake-key-v1",news("Başka bir başlıkla yapılan hatalı tekrar denemesi")),
      /external_key_conflict/);
    const prior=await cms.publish(first.id,1,when);
    assert.equal(prior.state,"quarantined");
    assert.ok(prior.failures?.includes("source_rights_missing"));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM published_content_versions")).rows[0].n,0);
    await pool.query(
      "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES($1,'official',$2,'Synthetic Manufacturer','https://example.org/synthetic-document',true,'synthetic-reviewer')",
      ["test-manufacturer-source","SYNTHETIC_SOURCE_LICENSE"]);
    await pool.query(
      "INSERT INTO cms_media_assets(id,r2_key,content_type,bytes,sha256_hex,alt_text,license_evidence_ref,rights_approved,reviewed_by) VALUES($1,$2,'image/png',24,$3,'Synthetic test image','SYNTHETIC_MEDIA_LICENSE',true,'synthetic-reviewer')",
      ["test-approved-hero","media/reviewed/test-approved-hero/fake.png","a".repeat(64)]);
    async function grant(revision:number){
      await pool.query(
        "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author,verified_at) VALUES($1,$2,true,true,true,true,'independent-test-reviewer','Synthetic Test Writer',$3)",
        [first.id,revision,when]);
    }
    await grant(1);
    const firstPublished=await cms.publish(first.id,1,when);
    assert.equal(firstPublished.state,"published");assert.equal(firstPublished.version,1);
    assert.deepEqual(firstPublished.routes,["/haberler/sentetik-teknoloji-haberi","/haberler","/"]);
    const replay=await cms.publish(first.id,1,when);
    assert.equal(replay.replay,true);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM cms_delivery_outbox")).rows[0].n,1);

    const rev=await cms.revise(first.id,1,news("Tamamen sentetik teknoloji haberi: ikinci sürüm"));
    assert.equal(rev.revision,2);
    await assert.rejects(()=>cms.revise(first.id,1,news()),/revision_conflict/);
    const deniedRev=await cms.publish(first.id,2,when);
    assert.equal(deniedRev.state,"quarantined");
    // A failed draft revision cannot change the public immutable version.
    const publicBefore=await pool.query(
      "SELECT v.public_payload FROM content_submissions s JOIN published_content_versions v ON v.submission_id=s.id WHERE s.id=$1 ORDER BY v.version DESC LIMIT 1",
      [first.id]);
    assert.equal(publicBefore.rows[0].public_payload.title,news().title);
    assert.equal(publicBefore.rows[0].public_payload.author,"Synthetic Test Writer");
    assert.equal((await pool.query("SELECT state FROM content_submissions WHERE id=$1",[first.id])).rows[0].state,"published");
    await grant(2);
    const second=await cms.publish(first.id,2,when);
    assert.equal(second.version,2);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM published_content_versions")).rows[0].n,2);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM cms_delivery_outbox")).rows[0].n,2);

    const removed=await cms.withdraw(first.id,2);
    assert.equal(removed.version,3);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM published_route_bindings")).rows[0].n,0);
    assert.equal((await pool.query("SELECT state FROM content_submissions WHERE id=$1",[first.id])).rows[0].state,"withdrawn");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM cms_delivery_outbox")).rows[0].n,3);
    await assert.rejects(()=>cms.publish(first.id,3,when),/withdrawn_requires_explicit_reactivation/);

    const outbox=await cms.pendingOutbox();
    assert.equal(outbox.length,3);
    assert.equal(outbox[2].event_kind,"withdrawn");
    assert.equal(await cms.markDelivered(outbox[0].id),true);
    assert.equal(await cms.markDelivered(outbox[0].id),false);
    assert.equal((await cms.pendingOutbox()).length,2);
    await pool.query(
      "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES($1,'manufacturer',$2,'Second synthetic spec source','https://example.org/second-synthetic-source',true,'synthetic-reviewer')",
      ["test-secondary-source","SYNTHETIC_SECOND_LICENSE"]);
    // A separate phone record must pass per-field source attestation before publish.
    const phone = {
      type:"phone" as const,slug:"sentetik-deneme-telefonu",
      title:"Sentetik test telefonu ve doğrulanmış teknik özellik",
      summary:"Bu tamamen sentetik ürün kaydı, teknik özellik kaynaklarının zorunlu olarak doğrulandığını test eder.",
      brand:"Fictional",modelCode:"FAKE-CI-01",market:"TR",
      language:"tr",observedAt:"2026-11-07T20:00:00Z",
      sources:["test-secondary-source","test-manufacturer-source"],coverMediaId:"test-approved-hero",
      variants:[{name:"Deneme 8 GB / 256 GB",ramGb:8,storageGb:256,warrantyClass:"test-warranty"}],
      specifications:[{label:"Ekran",value:"6 inç sentetik",sourceId:"test-secondary-source"}]
    };
    const phoneRecord=await cms.submit("test-phone-001",phone);
    const unreviewed=await cms.publish(phoneRecord.id,1,when);
    assert.equal(unreviewed.state,"quarantined");
    await pool.query(
      "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author,verified_at) VALUES($1,1,true,true,true,true,'independent-test-reviewer','Synthetic Test Writer',$2)",
      [phoneRecord.id,when]);
    const phonePublished=await cms.publish(phoneRecord.id,1,when);
    assert.equal(phonePublished.state,"published");
    const publicPhone=await pool.query(
      "SELECT v.public_payload FROM published_content_versions v WHERE v.submission_id=$1 AND v.version=1",[phoneRecord.id]);
    assert.equal(publicPhone.rows[0].public_payload.specifications[0].sourceLabel,"Second synthetic spec source");
    assert.equal(publicPhone.rows[0].public_payload.specifications[0].sourceId,undefined);
    assert.deepEqual(phonePublished.routes,[
      "/telefonlar/sentetik-deneme-telefonu","/telefonlar","/karsilastir"
    ]);
    // The public reader must explicitly require state='published' even when
    // historical immutable published_content_versions rows still exist.
    await cms.withdraw(phoneRecord.id,1);
    const hidden=await pool.query(
      "SELECT v.public_payload FROM content_submissions s JOIN published_content_versions v ON v.submission_id=s.id WHERE s.id=$1 AND s.state='published'",
      [phoneRecord.id]);
    assert.equal(hidden.rowCount,0);
    // No real phone, merchant, or news data crossed the test database boundary.
  }finally{
    await pool.end();
    await admin.query("DROP SCHEMA IF EXISTS tur006_cms_test CASCADE");
    await admin.end();
  }
});
