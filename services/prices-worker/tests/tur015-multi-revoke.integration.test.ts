import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {CmsRepository} from "../src/cms/repository";
import {revokeLicensedResource} from "../src/cms/rights-revoker";
import {revokeIssuerAuthority} from "../src/cms/issuer-revoker";
import {createCmsAuthorizedPipeline} from "../src/cms/authorized-pipeline";
import {temporaryCiIssuer,addVerifiedAttestation} from "./fixtures/ci-issuer";
import {publicCmsListSql} from "../src/cms/public-sql.mjs";
const URI=process.env.TEST_DATABASE_URL;
if(!URI)throw Error("TEST_DATABASE_URL is mandatory");
const schema="tur015_multi_dep_ci";
const fixed=new Date();
function article(slug:string,sources:string[]){
 return {
  type:"news" as const,slug,title:"Fictional concurrency document "+slug,
  summary:"An entirely fictitious approved article used only for multi-revocation load tests.",
  body:"This original paragraph is a test-only record in an ephemeral PostgreSQL database. It contains no real journalism, device, merchant, service, image, person, licence grant, company, sale, location, phone price or commercial offer. It validates concurrent publisher safety.",
  language:"tr",observedAt:"2026-11-08T09:00:00Z",sources
 };
}
const schemaMigrations=[
 "0003_content_cms.sql","0004_cms_delivery.sql",
 "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
 "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
 "0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql",
 "0011_cms_queue_receipt_hash.sql","0012_cms_mutation_commit_guard.sql",
 "0013_cms_legacy_receipt_recovery.sql","0014_cms_secdef_authorization.sql"
];
test("40 published pages with overlapping licensed sources/independent signed issuer reject concurrent unsafe mutations with one durable withdrawal per page",async()=>{
 const admin=new pg.Pool({connectionString:URI,max:1});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:URI,options:"-c search_path="+schema,max:16,
  statement_timeout:30000});
 try{
  for(const file of schemaMigrations){
   await db.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  }
  for(const id of ["ci-tur015-source-a","ci-tur015-source-b"]){
   await db.query(
    "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES($1,'manufacturer','CI_ORIGINAL_SOURCE_ONLY','Synthetic original source','https://example.org/ci-only',true,'Independent CI Rights Officer')",[id]);
  }
  const signer=temporaryCiIssuer();
  const authority="ci-tur015-independent-signer";
  await db.query("INSERT INTO cms_review_authorities(id,active,reviewer_class,public_key_pem) VALUES($1,true,'licensed_verifier',$2)",
   [authority,signer.publicPem]);
  const repo=new CmsRepository(db);
  const pipeline=createCmsAuthorizedPipeline(db,{async send(){}},()=>fixed);
  const records:{id:string;slug:string;auto:boolean}[]=[];
  for(let i=0;i<40;i++){
   const slug="ci-tur015-concurrent-"+i;
   // All rows depend on source A or B, and 10 depend on BOTH. The
   // independent signer governs every third row across both sources.
   const sources=i<15?["ci-tur015-source-a"]:
    i<30?["ci-tur015-source-b"]:
    ["ci-tur015-source-a","ci-tur015-source-b"];
   const row=await repo.submit("ci-tur015-"+i,article(slug,sources));
   const auto=i%3===0;
   if(auto){
    for(const type of ["editorial","originality"]){
     await addVerifiedAttestation(db,{submissionId:row.id,revision:1,type,
      authorityId:authority,privateKey:signer.privateKey,verifiedAt:fixed});
    }
    const result=await pipeline.process(row.id,1);
    assert.equal(result.state,"published",JSON.stringify(result));
   }else{
    await db.query(
     "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author) VALUES($1,1,true,true,true,true,'CI Independent Reviewer','Fictional CI Editor')",
     [row.id]);
    assert.equal((await repo.publish(row.id,1,fixed)).state,"published");
   }
   records.push({id:row.id,slug,auto});
  }
  assert.equal(records.length,40);
  assert.equal((await db.query(publicCmsListSql,["news"])).rows.length,40);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_delivery_outbox WHERE event_kind='published'")).rows[0].n,40);

  // Raw direct changes MUST be rejected. This concurrently probes three
  // independent sensitive resources against a full publication snapshot.
  const raw=await Promise.allSettled([
    db.query("UPDATE cms_trusted_sources SET rights_approved=false WHERE id='ci-tur015-source-a'"),
    db.query("UPDATE cms_trusted_sources SET rights_approved=false WHERE id='ci-tur015-source-b'"),
    db.query("UPDATE cms_review_authorities SET active=false WHERE id=$1",[authority])
  ]);
  assert.ok(raw.every(x=>x.status==="rejected"),"no direct write can bypass a withdrawal outbox");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages")).rows[0].n,40);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_mutation_guard_ledger")).rows[0].n,0);

  const ops=[
    ()=>revokeLicensedResource(db,"source","ci-tur015-source-a","CI_LICENSE_REVOCATION_A_2026","CI Independent Officer A"),
    ()=>revokeLicensedResource(db,"source","ci-tur015-source-b","CI_LICENSE_REVOCATION_B_2026","CI Independent Officer B"),
    ()=>revokeIssuerAuthority(db,authority,"CI_SIGNER_REVOCATION_2026","CI Independent Security Officer")
  ];
  const attempts=[0,0,0];
  async function carefullyRetry(i:number){
   for(let round=0;round<8;round++){
    attempts[i]++;
    try{return await ops[i]()}
    catch(error:any){
     const code=error?.code??"";
     const textError=String(error?.message??error);
     if(!["40P01","40001","55P03","23514"].includes(code)&&
        !/cms_unfenced_sensitive_mutation_requires_withdrawal_outbox|deadlock detected/.test(textError))
       throw error;
     if(round===7)throw Error("concurrent_revocation_exceeded_bounded_retry_budget "+i+" "+textError);
     await new Promise(r=>setTimeout(r,10+(i+round)*20));
    }
   }
   throw Error("exhausted_retries");
  }
  const results=await Promise.all([0,1,2].map(carefullyRetry));
  assert.equal(results.reduce((n,r)=>n+r.withdrawn,0),40);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM content_submissions WHERE state='withdrawn'")).rows[0].n,40);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages")).rows[0].n,0);
  const tally=(await db.query("SELECT event_kind,count(*)::int AS n FROM cms_delivery_outbox GROUP BY event_kind ORDER BY event_kind")).rows;
  assert.deepEqual(Object.fromEntries(tally.map(x=>[x.event_kind,x.n])),
   {published:40,withdrawn:40});
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_publication_fences WHERE state='withdrawn'")).rows[0].n,40);
  // Ledger grain is (submission, sensitive resource), NOT one row per
  // withdrawal. The ten doubly licensed pages must have two independent
  // sensitive mutation records, but only ONE withdrawn outbox event.
  const guardAudit=(await db.query(
    "SELECT count(*)::int AS n,count(DISTINCT submission_id)::int AS pages FROM cms_mutation_guard_ledger"
  )).rows[0];
  assert.ok(guardAudit.n>=40 && guardAudit.n<=120,
    "all affected resource mutations are separately captured");
  assert.equal(guardAudit.pages,40,"no impacted published page missed");
  const withoutPurge=(await db.query(
    "SELECT count(*)::int AS n FROM cms_mutation_guard_ledger g WHERE NOT EXISTS (SELECT 1 FROM cms_delivery_outbox o WHERE o.submission_id=g.submission_id AND o.revision_no=g.expected_revision AND o.event_kind='withdrawn')"
  )).rows[0].n;
  assert.equal(withoutPurge,0,"every ledger row has a matching durable takedown outbox");
  for(const row of records){
   const event=(await db.query("SELECT revision_no FROM cms_delivery_outbox WHERE submission_id=$1 AND event_kind='withdrawn'",[row.id])).rows;
   assert.deepEqual(event.map(x=>x.revision_no),[2]);
  }
  const read=await Promise.all(Array.from({length:72},()=>
   db.query("SELECT count(*)::int AS n FROM cms_public_pages")));
  assert.ok(read.every(x=>x.rows[0].n===0),"no reader sees invalid source or issuer after commit");
  const rights=(await db.query(
    "SELECT id,rights_approved FROM cms_trusted_sources ORDER BY id")).rows;
  assert.ok(rights.every(r=>r.rights_approved===false));
  assert.equal((await db.query("SELECT active FROM cms_review_authorities WHERE id=$1",[authority])).rows[0].active,false);
  console.log(JSON.stringify({suite:"TUR015_MULTI_RIGHTS_ISSUER_LOAD",records:40,
   concurrentActions:3,retryCounts:attempts,totalOutbox:80,parallelFinalReads:72}));
 }finally{
  await db.end();
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await admin.end();
 }
});
