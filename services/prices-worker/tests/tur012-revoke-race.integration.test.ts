import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {CmsRepository} from "../src/cms/repository";
import {rollbackPublishedVersion} from "../src/cms/publication-rollback";
import {revokeLicensedResource} from "../src/cms/rights-revoker";
import {revokeIssuerAuthority} from "../src/cms/issuer-revoker";
import {createCmsAuthorizedPipeline} from "../src/cms/authorized-pipeline";
import {temporaryCiIssuer,addVerifiedAttestation} from "./fixtures/ci-issuer";

if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
const schema="tur012_revoke_race_ci";
const now=new Date();
const payload=(slug:string,sources:string[])=>({
  type:"news" as const,slug,title:"Completely invented historical rights race "+slug,
  summary:"Synthetic test record created only for bounded concurrency analysis.",
  body:"This entirely invented and original test-only paragraph exists solely in an ephemeral CI PostgreSQL database. It does not describe any real event, company, phone, product, merchant, offer, location, person, price, rights grant or photograph. Its only purpose is to validate signed review concurrency and rollback consistency.",
  language:"tr",observedAt:"2026-11-08T07:00:00Z",sources
});
test("license and signed-issuer rollback races never leave hidden invalid publication without purge event",async()=>{
 const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:"-c search_path="+schema,max:24});
 try{
  for(const f of [
    "0003_content_cms.sql","0004_cms_delivery.sql","0005_cms_trusted_attestations.sql",
    "0006_cms_security.sql","0007_cms_queue_receipts.sql",
    "0008_cms_issuer_lifecycle.sql","0009_cms_publication_rollback.sql"
  ])await db.query(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
  for(const id of ["ci-race-old","ci-race-new","ci-race-issuer-old"]){
   await db.query(
    "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES($1,'manufacturer','ORIGINAL_SYNTHETIC_LICENSE','CI fabricated source','https://example.org/ci-only',true,'CI Rights Verifier')",[id]);
  }
  const repo=new CmsRepository(db);
  async function review(id:string,revision:number,actor="CI Independent Reviewer"){
   await db.query(
    "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author) VALUES($1,$2,true,true,true,true,$3,'Fictional Editor')",
    [id,revision,actor]);
  }
  async function twoRevisions(i:number,automatic=false,authorityId=""){
   const slug="ci-tur012-race-"+i;
   const created=await repo.submit("ci-tur012-race-"+i,payload(slug,[automatic?"ci-race-issuer-old":"ci-race-old"]));
   if(automatic){
     const key=issuerKey;
     for(const type of ["editorial","originality"]){
       await addVerifiedAttestation(db,{
        submissionId:created.id,revision:1,type,authorityId,privateKey:key.privateKey,verifiedAt:now
       });
     }
     const approval=await pipeline.process(created.id,1);
     assert.equal(approval.state,"published",JSON.stringify(approval));
   }else{
     await review(created.id,1);
     assert.equal((await repo.publish(created.id,1)).state,"published");
   }
   await repo.revise(created.id,1,payload(slug,["ci-race-new"]));
   await review(created.id,2);
   assert.equal((await repo.publish(created.id,2)).state,"published");
   return created.id;
  }
  const issuerKey=temporaryCiIssuer();
  const issuerId="ci-tur012-signing-authority";
  await db.query("INSERT INTO cms_review_authorities(id,active,reviewer_class,public_key_pem) VALUES($1,true,'licensed_verifier',$2)",
    [issuerId,issuerKey.publicPem]);
  const pipeline=createCmsAuthorizedPipeline(db,{async send(){}},()=>now);
  const rightsIds=[];
  for(let i=0;i<8;i++)rightsIds.push(await twoRevisions(i));
  const operations=await Promise.allSettled([
    ...rightsIds.map(id=>rollbackPublishedVersion(db,{
       submissionId:id,expectedRevision:2,expectedPublicVersion:2,targetVersion:1,
       reasonRef:"CI-CONCURRENT-ROLLBACK-APPROVED",actor:"Independent CI Rollback Officer"
    })),
    revokeLicensedResource(db,"source","ci-race-old","CI-CONCURRENT-LICENSE-REVOCATION","Independent CI Rights Officer")
  ]);
  const revoked=operations.at(-1);
  assert.equal(revoked?.status,"fulfilled","source revocation must never lose to a rollback");
  const success=operations.slice(0,-1).filter(x=>x.status==="fulfilled").length;
  const blocked=operations.slice(0,-1).filter(x=>x.status==="rejected");
  assert.equal(success+blocked.length,rightsIds.length);
  for(const b of blocked){
    assert.match(String((b as PromiseRejectedResult).reason),/rollback_rights_revoked|revision_conflict|rollback_current_publication_required/);
  }
  assert.equal((revoked as PromiseFulfilledResult<any>).value.withdrawn,success);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages WHERE version=1")).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_publication_rollback_audit")).rows[0].n,success);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_delivery_outbox WHERE event_kind='withdrawn'")).rows[0].n,success);

  // A revoked signer must be revalidated for a historic automatic version.
  const signerRows=[];
  for(let i=8;i<12;i++)signerRows.push(await twoRevisions(i,true,issuerId));
  const signerOps=await Promise.allSettled([
   ...signerRows.map(id=>rollbackPublishedVersion(db,{
     submissionId:id,expectedRevision:2,expectedPublicVersion:2,targetVersion:1,
     reasonRef:"CI-CONCURRENT-SIGNER-ROLLBACK",actor:"Independent CI Rollback Officer",now
   })),
   revokeIssuerAuthority(db,issuerId,"CI-ISSUER-KEY-REVOKED-TEST-123","Independent CI Security Officer")
  ]);
  assert.equal(signerOps.at(-1)?.status,"fulfilled");
  const signedRestores=signerOps.slice(0,-1).filter(x=>x.status==="fulfilled").length;
  assert.equal((signerOps.at(-1) as PromiseFulfilledResult<any>).value.withdrawn,signedRestores);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages WHERE version=1")).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_publication_rollback_audit")).rows[0].n,success+signedRestores);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_delivery_outbox WHERE event_kind='withdrawn'")).rows[0].n,success+signedRestores);
 }finally{
   await db.end();
   await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
   await admin.end();
 }
});
