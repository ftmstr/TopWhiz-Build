import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {CmsRepository} from "../src/cms/repository";
import {revokeLicensedResource} from "../src/cms/rights-revoker";
import {publicCmsListSql,publicCmsDetailSql,publicMediaAssetSql} from "../src/cms/public-sql.mjs";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";

const url=process.env.TEST_DATABASE_URL;
if(!url)throw Error("TEST_DATABASE_URL must be configured; cannot silently skip");
const schema="tur008_security_ci";
const now=new Date("2026-11-07T22:00:00Z");
const base={
  type:"news" as const,slug:"synthetic-license-case",
  title:"Synthetic license revocation CI case",
  summary:"Purely synthetic test content for verifying license revocation and public data isolation.",
  body:"This article is an internal CI fixture, containing no factual claims about any commercial product, manufacturer, merchant or actual published announcement. It only tests authorization, revocation and durable cache invalidation safety.",
  observedAt:"2026-11-07T21:30:00Z",
  language:"tr",sources:["ci-license-a"],coverMediaId:"ci-photo-a"
};
test("PostgreSQL roles, signed-public view, revision-safe source/media revoke and queue receipts",async()=>{
  const admin=new pg.Pool({connectionString:url,max:2});
  const db=new pg.Pool({connectionString:url,options:"-c search_path="+schema,max:4});
  await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
  const repo=new CmsRepository(db);
  async function asRole(role:string,sql:string,params:any[]=[]){
    if(!/^tw_cms_[a-z_]+$/.test(role))throw Error("unapproved_role");
    const c=await db.connect();
    try{
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE "+role);
      const result=await c.query(sql,params);
      await c.query("ROLLBACK");
      return result;
    }catch(e){await c.query("ROLLBACK");throw e}
    finally{c.release()}
  }
  async function grant(id:string,rev:number){
    await db.query(
      "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author,verified_at) VALUES($1,$2,true,true,true,true,'CI Signed-off Human','CI Synthetic Author',$3)",
      [id,rev,now]);
  }
  try{
    for(const file of [
      "0003_content_cms.sql","0004_cms_delivery.sql",
      "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
      "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql"
    ])await db.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
    const script=readFileSync(new URL("../security/cms_roles.sql",import.meta.url),"utf8")
      .replaceAll("__TOPWHIZ_SCHEMA__",schema);
    await admin.query(script);

    const roles=await admin.query(
      "SELECT rolname,rolcanlogin,rolsuper FROM pg_roles WHERE rolname LIKE 'tw_cms_%' ORDER BY rolname");
    assert.equal(roles.rows.length,8);
    assert.ok(roles.rows.every(r=>r.rolcanlogin===false&&r.rolsuper===false));
    const draft=await asRole("tw_cms_intake",
      "SELECT * FROM cms_ingest_draft($1::varchar,$2::varchar,$3::varchar,$4::jsonb)",
      ["ci-role-intake","news","ci-intake-only",JSON.stringify({...base,slug:"ci-intake-only"})]);
    assert.equal(draft.rows[0].state,"pending_review");
    await assert.rejects(()=>asRole("tw_cms_intake","SELECT payload FROM content_submissions"),/permission denied/i);
    await assert.rejects(()=>asRole("tw_cms_intake","INSERT INTO cms_review_grants DEFAULT VALUES"),/permission denied/i);
    await assert.rejects(()=>asRole("tw_cms_attestor","UPDATE cms_trusted_sources SET rights_approved=true"),/permission denied/i);
    await assert.rejects(()=>asRole("tw_cms_reader","SELECT * FROM content_submissions"),/permission denied/i);
    await assert.rejects(()=>asRole("tw_cms_reader","SELECT * FROM cms_external_attestations"),/permission denied/i);
    await assert.rejects(()=>asRole("tw_cms_publisher","UPDATE cms_media_assets SET rights_approved=true"),/permission denied/i);
    await assert.rejects(()=>asRole("tw_cms_rights_admin","INSERT INTO cms_review_grants DEFAULT VALUES"),/permission denied/i);
    await assert.rejects(()=>asRole("tw_cms_queue_consumer","SELECT payload FROM content_submissions"),/permission denied/i);

    await db.query(
      "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES('ci-license-a','official','SYNTHETIC_LICENSE_A','CI source A','https://example.org/a',true,'CI Reviewer'),('ci-license-b','official','SYNTHETIC_LICENSE_B','CI source B','https://example.org/b',true,'CI Reviewer')");
    await db.query(
      "INSERT INTO cms_media_assets(id,r2_key,content_type,bytes,sha256_hex,alt_text,license_evidence_ref,rights_approved,reviewed_by) VALUES('ci-photo-a',$1,'image/png',12,$2,'CI image','SYNTHETIC_MEDIA_RIGHTS',true,'CI Reviewer')",
      ["media/reviewed/ci-photo-a/"+"a".repeat(64)+".png","a".repeat(64)]);
    const story=await repo.submit("ci-source-license-key",base);
    await grant(story.id,1);
    const published=await repo.publish(story.id,1,now);
    assert.equal(published.state,"published");
    const publicRead=await asRole("tw_cms_reader",publicCmsListSql,["news"]);
    assert.equal(publicRead.rows.length,1);
    assert.equal(publicRead.rows[0].content.title,base.title);
    assert.equal((await asRole("tw_cms_reader",publicMediaAssetSql,["ci-photo-a"])).rows.length,1);
    const rightsCount=(await db.query("SELECT count(*)::int AS n FROM cms_public_dependencies WHERE submission_id=$1",[story.id])).rows[0].n;
    assert.equal(rightsCount,2);
    // Introduce an unapproved draft revision with NEW source; revoking old
    // source must still hide the LAST PUBLIC version.
    const revision=await repo.revise(story.id,1,{
      ...base,sources:["ci-license-b"],coverMediaId:null
    });
    assert.equal(revision.revision,2);
    const first=await revokeLicensedResource(db,"source","ci-license-a","CI_AUTHENTIC_RIGHTS_WITHDRAWAL","CI Rights Officer");
    assert.equal(first.withdrawn,1);
    assert.equal((await asRole("tw_cms_reader",publicCmsListSql,["news"])).rows.length,0);
    assert.equal((await asRole("tw_cms_reader",publicCmsDetailSql,["news","synthetic-license-case"])).rows.length,0);
    assert.equal((await asRole("tw_cms_reader",publicMediaAssetSql,["ci-photo-a"])).rows.length,0);
    const event=await db.query("SELECT event_kind FROM cms_delivery_outbox WHERE submission_id=$1 ORDER BY created_at,id",[story.id]);
    assert.equal(event.rows.length,2);
    assert.ok(event.rows.some(r=>r.event_kind==="withdrawn"));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_rights_revocations")).rows[0].n,1);
    assert.equal((await revokeLicensedResource(db,"source","ci-license-a",
      "CI_REPEAT_RIGHTS_WITHDRAWAL","CI Rights Officer")).withdrawn,0);

    const second=await repo.submit("ci-media-license-key",{
      ...base,slug:"synthetic-photo-license-case",sources:["ci-license-b"]
    });
    await grant(second.id,1);
    assert.equal((await repo.publish(second.id,1,now)).state,"published");
    const mediaResult=await revokeLicensedResource(db,"media","ci-photo-a",
      "CI_VALID_MEDIA_REVOCATION","CI Rights Officer");
    assert.equal(mediaResult.withdrawn,1);
    assert.equal((await asRole("tw_cms_reader",publicCmsListSql,["news"])).rows.length,0);
    assert.equal((await asRole("tw_cms_reader",publicMediaAssetSql,["ci-photo-a"])).rows.length,0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_rights_revocations")).rows[0].n,3);
    // Durable receipts are acknowledged only with their own lease token.
    const query=async(sql:string,params:any[])=>(await db.query(sql,params)).rows;
    const receipts=makeReceiptStore(query);
    const eventId="11111111-1111-4111-8111-111111111111";
    const claim=await receipts.claim(eventId);
    assert.equal(claim.status,"acquired");
    assert.equal((await receipts.claim(eventId)).status,"busy");
    await assert.rejects(()=>receipts.complete(eventId,"22222222-2222-4222-8222-222222222222"),/lost_receipt_lease/);
    await receipts.release(eventId,claim.token);
    const retry=await receipts.claim(eventId);
    assert.equal(retry.status,"acquired");
    await receipts.complete(eventId,retry.token);
    assert.equal((await receipts.claim(eventId)).status,"completed");
    assert.equal((await asRole("tw_cms_queue_consumer","SELECT count(*)::int AS n FROM cms_purge_receipts")).rows[0].n,1);
    // None of these synthetic stories/images are written to production.
  }finally{
    await db.end();
    await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
    await admin.end();
  }
});
