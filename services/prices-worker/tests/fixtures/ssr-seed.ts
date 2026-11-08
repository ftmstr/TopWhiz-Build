import {makeSyntheticPng} from "./png-factory.mjs";
/**
 * CI-only, synthetic database setup for Next.js -> actual PostgreSQL API
 * contract -> local TLS-free fetch shim. No production changes or real offers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { createCmsAuthorizedPipeline } from "../../src/cms/authorized-pipeline";
import { stageLicensedMedia } from "../../src/cms/cloudflare-adapters.mjs";
import {temporaryCiIssuer,addVerifiedAttestation} from "./ci-issuer";

if(process.env.CI!=="true"||process.env.TOPWHIZ_SYNTHETIC_API!=="1")
  throw Error("Synthetic API fixture is forbidden outside GitHub CI");
if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");

const now=new Date("2026-11-07T22:00:00Z");
const issuer=temporaryCiIssuer();
const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
await admin.query("CREATE SCHEMA IF NOT EXISTS tur007_ssr_ci");
const db=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:"-c search_path=tur007_ssr_ci",max:2});
try{
  for(const name of ["0003_content_cms.sql","0004_cms_delivery.sql","0005_cms_trusted_attestations.sql","0006_cms_security.sql","0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql"])
    await db.query(readFileSync(new URL("../../migrations/"+name,import.meta.url),"utf8"));
  await db.query(
    "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by,reviewed_at) VALUES('ci-ssr-source','manufacturer','SYNTHETIC_CI_SOURCE_LICENSE','Synthetic API Source','https://example.org/nonreal-device',true,'CI Independent Reviewer',$1)",[now]);
  const image=makeSyntheticPng();
  const receipt=await stageLicensedMedia({async put() {}},"ci-ssr-hero",image,{
    rightsApproved:true,evidenceRef:"SYNTHETIC_CI_MEDIA_LICENSE",reviewer:"CI Independent Reviewer"});
  await db.query(
    "INSERT INTO cms_media_assets(id,r2_key,content_type,bytes,sha256_hex,alt_text,license_evidence_ref,rights_approved,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,'Synthetic empty illustration','SYNTHETIC_CI_RIGHTS',true,'CI Independent Reviewer',$6)",
    [receipt.assetId,receipt.key,receipt.contentType,receipt.bytes,receipt.sha256,now]);
  await db.query(
    "INSERT INTO cms_review_authorities(id,active,reviewer_class,public_key_pem) VALUES('ci-ssr-authority',true,'licensed_verifier',$1)",[issuer.publicPem]);
  const pipeline=createCmsAuthorizedPipeline(db,{async send(){}},()=>now);
  const news={
    type:"news" as const,slug:"ci-api-published-news",
    title:"CI API: Synthetic TopWhiz Article",
    summary:"Synthetic news material used solely to test database-backed Next.js API rendering.",
    body:"This is a fictional test announcement generated only for a controlled GitHub Actions test. It is not about any real manufacturer, model, price or publication. It tests a source-checked editorial process and is deleted when the test database container disappears.",
    language:"tr",observedAt:"2026-11-07T21:50:00Z",
    sources:["ci-ssr-source"],coverMediaId:"ci-ssr-hero"
  };
  const phone={
    type:"phone" as const,slug:"ci-api-published-phone",
    title:"CI API: Synthetic 256 GB Phone",
    summary:"Synthetic telephone catalog record exclusively for database-to-page integration tests.",
    brand:"CI Fictional Manufacturer",modelCode:"CI-NOT-REAL",market:"TR",
    language:"tr",observedAt:"2026-11-07T21:50:00Z",
    sources:["ci-ssr-source"],coverMediaId:"ci-ssr-hero",
    variants:[{name:"CI 8+256",ramGb:8,storageGb:256,warrantyClass:"Synthetic Warranty"}],
    specifications:[{label:"RAM",value:"8 GB CI fixture",sourceId:"ci-ssr-source"}]
  };
  for(const [externalKey,payload,types] of [
    ["ci-ssr-news",news,["editorial","originality"]],
    ["ci-ssr-phone",phone,["editorial","originality","specifications"]]
  ] as const){
    const row=await pipeline.repository.submit(externalKey,payload);
    for(const kind of types){
      await addVerifiedAttestation(db,{submissionId:row.id,revision:1,type:kind,
        authorityId:"ci-ssr-authority",privateKey:issuer.privateKey,
        verifiedAt:now,creditedAuthor:"CI Verified Test Writer"});
    }
    const published=await pipeline.process(row.id,1);
    assert.equal(published.state,"published","CI fixture must go through real reviewer/publisher");
  }
  const pubs=await db.query("SELECT count(*)::int AS n FROM published_content_versions");
  assert.equal(pubs.rows[0].n,2);
  process.stdout.write("CI PostgreSQL fixture: 2 synthetic content versions verified/published, 0 real content.\n");
}finally{
  await db.end();
  await admin.end();
}
