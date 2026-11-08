import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {CmsRepository} from "../src/cms/repository";
import {publicCmsListSql} from "../src/cms/public-sql.mjs";

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw Error("TEST_DATABASE_URL required");
const schema="tur009_service_ci";
const now=new Date("2026-11-07T22:00:00Z");
const groupNames=["reader","intake","attestor","reviewer","publisher","rights_admin","issuer_admin","queue_consumer"];
test("real PostgreSQL LOGIN sessions exercise each inherited least-privilege identity",async()=>{
 const admin=new pg.Pool({connectionString,max:3});
 await admin.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString,options:"-c search_path="+schema,max:2});
 const credentials=[];
 async function asService(name:string,sql:string,parameters:any[]=[]){
   const item=credentials.find(c=>c.group===name);
   if(!item)throw Error("service_role_missing");
   const uri=new URL(connectionString);
   uri.username=item.login;uri.password=item.password;
   const client=new pg.Client({connectionString:uri.toString(),
     options:"-c search_path="+schema});
   await client.connect();
   try{
     const user=(await client.query("SELECT current_user AS who")).rows[0].who;
     assert.equal(user,item.login,"must connect as a separate login, not SET ROLE as DB owner");
     return await client.query(sql,parameters);
   }finally{await client.end()}
 }
 try{
  for(const f of ["0003_content_cms.sql","0004_cms_delivery.sql",
    "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
    "0007_cms_queue_receipts.sql","0008_cms_issuer_lifecycle.sql","0009_cms_publication_rollback.sql"])
    await db.query(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
  await admin.query(readFileSync(new URL("../security/cms_roles.sql",import.meta.url),"utf8")
    .replaceAll("__TOPWHIZ_SCHEMA__",schema));
  for(const group of groupNames){
    const login="tw_ci009_"+group;
    const password=randomBytes(30).toString("hex");
    // Identifiers are constant from source-controlled groupNames, and the
    // generated password is hexadecimal, never user input or committed.
    await admin.query("CREATE ROLE "+login+
      " LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
    await admin.query("GRANT tw_cms_"+group+" TO "+login+" WITH INHERIT TRUE");
    credentials.push({group,login,password});
  }
  await db.query(
    "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES('ci-login-source','manufacturer','SYNTHETIC_LICENSE_SOURCE','CI Source','https://example.org/not-real',true,'CI Reviewer')");
  const draft={
    type:"news" as const,slug:"ci-service-session-article",
    title:"Synthetic CI service session article",
    summary:"An entirely synthetic news fixture used for service-account privilege tests.",
    body:"This is a fictitious article for CI database permission tests. No live website, actual consumer brand, public news, real price or commercial claim is made here. It is deleted after each test.",
    language:"tr",observedAt:"2026-11-07T21:50:00Z",
    sources:["ci-login-source"]
  };
  const repo=new CmsRepository(db);
  const row=await repo.submit("ci-login-published",draft);
  await db.query(
    "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author,verified_at) VALUES($1,1,true,true,true,true,'CI Manual Reviewer','CI Example Author',$2)",[row.id,now]);
  assert.equal((await repo.publish(row.id,1,now)).state,"published");
  const publicRead=await asService("reader",publicCmsListSql,["news"]);
  assert.equal(publicRead.rows.length,1);
  assert.equal(publicRead.rows[0].content.title,draft.title);
  const intake=await asService("intake",
    "SELECT * FROM cms_ingest_draft($1::varchar,$2::varchar,$3::varchar,$4::jsonb)",
    ["ci-login-write","news","ci-login-write",JSON.stringify({...draft,slug:"ci-login-write"})]);
  assert.equal(intake.rows[0].state,"pending_review");

  // Real sessions demonstrate positive permissions and deny cross-service use.
  await assert.rejects(()=>asService("reader","SELECT payload FROM content_submissions"),/permission denied/i);
  await assert.rejects(()=>asService("reader","SET ROLE tw_cms_publisher"),/permission denied/i);
  await assert.rejects(()=>asService("intake","SELECT payload FROM content_submissions"),/permission denied/i);
  await assert.rejects(()=>asService("intake","INSERT INTO cms_review_grants DEFAULT VALUES"),/permission denied/i);
  await assert.rejects(()=>asService("attestor","UPDATE cms_review_authorities SET active=false"),/permission denied/i);
  await assert.rejects(()=>asService("reviewer","UPDATE cms_review_authorities SET active=false"),/permission denied/i);
  await assert.rejects(()=>asService("publisher","UPDATE cms_trusted_sources SET rights_approved=true"),/permission denied/i);
  await assert.rejects(()=>asService("rights_admin","INSERT INTO cms_review_grants DEFAULT VALUES"),/permission denied/i);
  await assert.rejects(()=>asService("issuer_admin","UPDATE cms_media_assets SET rights_approved=true"),/permission denied/i);
  await assert.rejects(()=>asService("queue_consumer","SELECT payload FROM content_submissions"),/permission denied/i);
  await assert.rejects(()=>asService("reader",
    "DELETE FROM published_content_versions"),/permission denied/i);
  await assert.rejects(()=>asService("intake",
    "UPDATE cms_review_authorities SET active=false"),/permission denied/i);
  await assert.rejects(()=>asService("attestor",
    "SELECT * FROM published_content_versions"),/permission denied/i);
  await assert.rejects(()=>asService("reviewer",
    "DELETE FROM cms_public_issuer_dependencies"),/permission denied/i);
  await assert.rejects(()=>asService("publisher",
    "INSERT INTO cms_external_attestations DEFAULT VALUES"),/permission denied/i);
  await assert.rejects(()=>asService("rights_admin",
    "UPDATE cms_review_authorities SET active=false"),/permission denied/i);
  await assert.rejects(()=>asService("issuer_admin",
    "UPDATE cms_trusted_sources SET rights_approved=true"),/permission denied/i);
  await assert.rejects(()=>asService("queue_consumer",
    "DELETE FROM cms_purge_receipts"),/permission denied/i);
  assert.equal((await asService("queue_consumer","SELECT count(*)::int AS n FROM cms_purge_receipts")).rows[0].n,0);
  assert.equal((await asService("publisher","SELECT count(*)::int AS n FROM published_content_versions")).rows[0].n,1);
  assert.equal((await asService("rights_admin","SELECT count(*)::int AS n FROM cms_trusted_sources")).rows[0].n,1);
  assert.equal((await asService("reviewer","SELECT count(*)::int AS n FROM cms_review_grants")).rows[0].n,1);
  assert.equal((await asService("attestor","SELECT count(*)::int AS n FROM cms_review_authorities")).rows[0].n,0);
  assert.equal((await asService("issuer_admin","SELECT count(*)::int AS n FROM cms_review_authorities")).rows[0].n,0);
 }finally{
  await db.end();
  // Close service sessions in asService() before dropping ephemeral logins.
  for(const identity of credentials.reverse()){
    await admin.query("REVOKE tw_cms_"+identity.group+" FROM "+identity.login);
    await admin.query("DROP ROLE IF EXISTS "+identity.login);
  }
  await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await admin.end();
 }
});
