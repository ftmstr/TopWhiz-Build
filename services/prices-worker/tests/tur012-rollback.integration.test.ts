import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {CmsRepository} from "../src/cms/repository";
import {rollbackPublishedVersion} from "../src/cms/publication-rollback";
import {revokeLicensedResource} from "../src/cms/rights-revoker";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";
import {consumeCmsPurgeBatch,dispatchCmsOutbox,createCloudflareZonePurger} from "../src/cms/cloudflare-adapters.mjs";

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw Error("TEST_DATABASE_URL required — must not silently skip");
const schema="tur012_rollback_ci";
const original="ci-tur012-history-a";
const replacement="ci-tur012-history-b";
const article=(slug:string,label:string,source:string)=>({
 type:"news" as const,slug,title:"CI-only version "+label+" "+slug,
 summary:"A fictional approved newsroom fixture for historical rollback transaction testing.",
 body:"This completely invented article is a synthetic PostgreSQL record; it does not describe a real device, brand, company, product launch, news event, price, merchant or media rights grant.",
 language:"tr",observedAt:"2026-11-08T07:00:00Z",sources:[source]
});
test("rollback old publication is strictly rights rechecked; outbox and CDN races do not resurrect old pages",async()=>{
 const root=new pg.Pool({connectionString,max:1});
 await root.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString,options:"-c search_path="+schema,max:20});
 try{
  for(const migration of [
   "0003_content_cms.sql","0004_cms_delivery.sql",
   "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
   "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql",
   "0009_cms_publication_rollback.sql"
  ])await db.query(readFileSync(new URL("../migrations/"+migration,import.meta.url),"utf8"));
  for(const id of [original,replacement]){
    await db.query(
      "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES($1,'manufacturer','SYNTHETIC_RIGHTS_ONLY','CI Original Source','https://example.org/rollback-test',true,'Independent CI Rights Controller')",
      [id]);
  }
  const repo=new CmsRepository(db);
  const evidence=async(id:string,rev:number)=>{
    await db.query(
     "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author) VALUES($1,$2,true,true,true,true,'Independent CI Reviewer','Fictional Author')",
     [id,rev]);
  };
  async function versions(i:number){
   const slug="ci-tur012-history-"+i;
   const created=await repo.submit("ci-tur012-key-"+i,article(slug,"FIRST",original));
   await evidence(created.id,1);
   assert.equal((await repo.publish(created.id,1)).state,"published");
   assert.equal((await db.query("SELECT publication_version FROM cms_publication_heads WHERE submission_id=$1",[created.id])).rows[0].publication_version,1);
   await repo.revise(created.id,1,article(slug,"SECOND",replacement));
   await evidence(created.id,2);
   assert.equal((await repo.publish(created.id,2)).state,"published");
   assert.equal((await db.query("SELECT version FROM cms_public_pages WHERE submission_id=$1",[created.id])).rows[0].version,2);
   return created.id;
  }
  const first=await versions(0);
  const toOld=()=>rollbackPublishedVersion(db,{
    submissionId:first,expectedRevision:2,expectedPublicVersion:2,
    targetVersion:1,actor:"Independent CI Rollback Controller",
    reasonRef:"CI-APPROVED-VERSION-ROLLBACK-01"
  });
  const restored=await toOld();
  assert.equal(restored.activeVersion,1);
  assert.equal(restored.resultingRevision,3);
  assert.equal((await db.query("SELECT version,content->>'title' AS title FROM cms_public_pages WHERE submission_id=$1",[first])).rows[0].version,1);
  await assert.rejects(toOld(),/revision_conflict/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_publication_rollback_audit WHERE submission_id=$1",[first])).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_delivery_outbox WHERE submission_id=$1 AND event_kind='published'",[first])).rows[0].n,3);

  // A historical source is revoked while a NEWER version remains active:
  // it cannot subsequently become public through rollback.
  const deniedId=await versions(1);
  const rights=await revokeLicensedResource(db,"source",original,
   "CI-LICENSE-DENIAL-REFERENCE-123","Independent CI Rights Controller");
  assert.equal(rights.withdrawn,1,"only currently restored first publication should be withdrawn");
  assert.equal((await db.query("SELECT 1 FROM cms_public_pages WHERE submission_id=$1",[first])).rowCount,0);
  await assert.rejects(
    rollbackPublishedVersion(db,{
      submissionId:deniedId,expectedRevision:2,expectedPublicVersion:2,
      targetVersion:1,actor:"Independent CI Rollback Controller",
      reasonRef:"CI-DENIED-HISTORY-ROLLBACK-02"
    }),/rollback_rights_revoked/);
  assert.equal((await db.query("SELECT version FROM cms_public_pages WHERE submission_id=$1",[deniedId])).rows[0].version,2);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_delivery_outbox WHERE submission_id=$1",[first])).rows[0].n,4);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_delivery_outbox WHERE submission_id=$1",[deniedId])).rows[0].n,2);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_publication_rollback_audit")).rows[0].n,1);
  await assert.rejects(()=>rollbackPublishedVersion(db,{
    submissionId:first,expectedRevision:4,expectedPublicVersion:1,
    targetVersion:2,actor:"Independent CI Rollback Controller",
    reasonRef:"CI-AFTER-TAKEDOWN"
  }),/invalid_rollback_request/);

  // Cache invalidation events can arrive out of order or be replayed.
  // Each is a route-only purge, not permission to republish past content.
  const queued=[];
  const delivered=await dispatchCmsOutbox(repo,{async send(event){queued.push(event)}},20);
  assert.equal(delivered.delivered,6);
  assert.equal(queued.length,6);
  const zone="a".repeat(32);
  const zoneRequests=[];
  const cache=new Map([["/haberler/ci-tur012-history-0","STALE FIRST VERSION"]]);
  const purge=createCloudflareZonePurger({
   zoneId:zone,apiToken:"CI_ONLY_NEVER_REAL_TOKEN",
   origin:"https://topwhiz.invalid/",
   fetcher:async(url,opts)=>{
      assert.ok(url.startsWith("https://api.cloudflare.com/client/v4/zones/"));
      assert.equal(opts.method,"POST");
      const paths=JSON.parse(opts.body).files;
      zoneRequests.push(paths);
      paths.forEach((x:string)=>cache.delete(new URL(x).pathname));
      return {ok:true,json:async()=>({success:true})};
   }
  });
  const receipts=makeReceiptStore(async(sql,args)=>(await db.query(sql,args)).rows);
  let ack=0;
  const shuffled=[...queued].reverse();
  for(const item of [...shuffled,...shuffled]){
   await consumeCmsPurgeBatch({messages:[{
     body:item,attempts:1,ack(){ack++},retry(){throw Error("unexpected_cache_retry")}
   }]},purge,receipts);
  }
  assert.equal(ack,12);
  assert.equal(zoneRequests.length,6,"idempotency receipts suppress repeat CDN purge");
  assert.equal(cache.has("/haberler/ci-tur012-history-0"),false);
  assert.equal((await db.query("SELECT 1 FROM cms_public_pages WHERE submission_id=$1",[first])).rowCount,0);
  assert.equal((await db.query("SELECT version FROM cms_public_pages WHERE submission_id=$1",[deniedId])).rows[0].version,2);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_purge_receipts WHERE status='completed'")).rows[0].n,6);
 }finally{
  await db.end();
  await root.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await root.end();
 }
});
