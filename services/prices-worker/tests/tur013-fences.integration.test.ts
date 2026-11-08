import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {CmsRepository} from "../src/cms/repository";
import {rollbackPublishedVersion} from "../src/cms/publication-rollback";
import {revokeLicensedResource} from "../src/cms/rights-revoker";
import {publicCmsDetailSql} from "../src/cms/public-sql.mjs";
const uri=process.env.TEST_DATABASE_URL;
if(!uri)throw Error("TEST_DATABASE_URL required — no silent skips");
const schema="tur013_cache_fences_ci";
const source="ci-tur013-rights";
const now=new Date();
function synthetic(slug:string,tag:string){return {
 type:"news" as const,slug,title:"Synthetic journal entry "+tag+" "+slug,
 summary:"A fictional technology catalog entry used exclusively for concurrency verification.",
 body:"An original synthetic paragraph created solely to validate the ephemeral PostgreSQL security-barrier read. This statement does not describe any real company, device, merchant, user, product launch, external licensing agreement, deal, image or personal data. Tests must never be published.",
 language:"tr",observedAt:"2026-11-08T09:00:00Z",sources:[source]
};}
test("monotonic publication fence and durable outbox deny stale/forged head and revoked licenses",async()=>{
 const admin=new pg.Pool({connectionString:uri,max:1});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:uri,options:"-c search_path="+schema,max:20});
 try{
   for(const file of [
    "0003_content_cms.sql","0004_cms_delivery.sql","0005_cms_trusted_attestations.sql",
    "0006_cms_security.sql","0007_cms_queue_receipts.sql",
    "0008_cms_issuer_lifecycle.sql","0009_cms_publication_rollback.sql",
    "0010_cms_cache_fences.sql","0011_cms_queue_receipt_hash.sql"
   ])await db.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
   await db.query(
    "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES($1,'manufacturer','SYNTHETIC_ONLY_RIGHTS','Fake CI Source','https://example.org/fictional-rights',true,'Independent CI Admin')",
    [source]);
   const repo=new CmsRepository(db);
   async function review(id:string,revision:number){
    await db.query(
     "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author) VALUES($1,$2,true,true,true,true,'CI Reviewer','Synthetic Editor')",
     [id,revision]);
   }
   const ids=[];
   for(let i=0;i<18;i++){
     const slug="ci-fence-"+i;
     const row=await repo.submit("ci-fence-"+i,synthetic(slug,"ONE"));
     await review(row.id,1);
     assert.equal((await repo.publish(row.id,1,now)).state,"published");
     ids.push({id:row.id,slug});
   }
   assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages")).rows[0].n,18);
   const target=ids[0],id=target.id;
   const first=(await db.query(publicCmsDetailSql,["news",target.slug])).rows[0];
   assert.equal(first.version,1);
   assert.equal(Number(first.fenceGeneration),1);
   await repo.revise(id,1,synthetic(target.slug,"SECOND"));
   // Draft edits cannot prematurely switch the old publicly approved head.
   assert.equal((await db.query(publicCmsDetailSql,["news",target.slug])).rows[0].version,1);
   await review(id,2);
   assert.equal((await repo.publish(id,2,now)).state,"published");
   assert.equal((await db.query(publicCmsDetailSql,["news",target.slug])).rows[0].fenceGeneration,"2");
   // Bypass roles in this CI-only fixture to simulate a bug or compromised
   // owner tampering with the generation. A security-barrier read MUST deny.
   await db.query("UPDATE cms_publication_fences SET generation=1 WHERE submission_id=$1",[id]);
   assert.equal((await db.query(publicCmsDetailSql,["news",target.slug])).rowCount,0);
   await db.query("UPDATE cms_publication_fences SET generation=2 WHERE submission_id=$1",[id]);
   assert.equal((await db.query(publicCmsDetailSql,["news",target.slug])).rowCount,1);
   const rollback=await rollbackPublishedVersion(db,{
     submissionId:id,expectedRevision:2,expectedPublicVersion:2,targetVersion:1,
     actor:"Independent CI Operator",reasonRef:"SYNTHETIC_ROLLBACK_TICKET_013",now
   });
   assert.equal(rollback.resultingRevision,3);
   const previous=(await db.query(publicCmsDetailSql,["news",target.slug])).rows[0];
   assert.equal(previous.version,1);
   assert.equal(Number(previous.fenceGeneration),3);
   // A forged/high or low fence generation fails the SQL barrier.
   await db.query("UPDATE cms_publication_fences SET generation=2 WHERE submission_id=$1",[id]);
   assert.equal((await db.query(publicCmsDetailSql,["news",target.slug])).rowCount,0);
   await db.query("UPDATE cms_publication_fences SET generation=3 WHERE submission_id=$1",[id]);
   const replay=await repo.withdraw(id,3);
   assert.equal(replay.state,"withdrawn");
   assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages WHERE submission_id=$1",[id])).rows[0].n,0);
   assert.equal((await db.query("SELECT generation,state FROM cms_publication_fences WHERE submission_id=$1",[id])).rows[0].state,"withdrawn");
   await assert.rejects(()=>rollbackPublishedVersion(db,{
     submissionId:id,expectedRevision:4,expectedPublicVersion:2,targetVersion:1,
     actor:"Independent CI Operator",reasonRef:"INVALID_REACTIVATE_TICKET",now
   }),/rollback_current_publication_required|active_public_version_conflict/);
   // Revocation of the common original source must withdraw the remaining
   // 17 content rows and never bypass cache-generation fences.
   const rights=await revokeLicensedResource(db,"source",source,
    "CI_COMPLIANCE_TERMINATION_FOR_ALL","Independent CI Rights Admin");
   assert.equal(rights.withdrawn,17);
   assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages")).rows[0].n,0);
   assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_publication_fences WHERE state='withdrawn'")).rows[0].n,18);
   const outbox=(await db.query("SELECT count(*)::int AS n FROM cms_delivery_outbox")).rows[0].n;
   assert.equal(outbox,38,"18 first publications + second + rollback + explicit withdrawal + 17 license withdrawals");
   const read=await Promise.all(Array.from({length:64},()=>db.query("SELECT count(*)::int AS n FROM cms_public_pages")));
   assert.ok(read.every(r=>r.rows[0].n===0),"no parallel reader may see revoked content after commit");
 }finally{
   await db.end();
   await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
   await admin.end();
 }
});
