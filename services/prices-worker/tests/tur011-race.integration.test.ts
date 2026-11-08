import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {CmsRepository} from "../src/cms/repository";
import {createCmsAuthorizedPipeline} from "../src/cms/authorized-pipeline";
import {revokeIssuerAuthority,reconcileInvalidIssuerPublications} from "../src/cms/issuer-revoker";
import {revokeLicensedResource} from "../src/cms/rights-revoker";
import {makeReceiptStore} from "../src/cms/queue-receipts.mjs";
import {consumeCmsPurgeBatch,stageLicensedMedia} from "../src/cms/cloudflare-adapters.mjs";
import {handleCmsMedia} from "../src/cms/media-handler.mjs";
import {temporaryCiIssuer,addVerifiedAttestation} from "./fixtures/ci-issuer";
import {makeSyntheticPng} from "./fixtures/png-factory.mjs";

const url=process.env.TEST_DATABASE_URL;
if(!url)throw Error("TEST_DATABASE_URL required — this test must not silently skip");
const schema="tur011_race_ci";
const now=new Date("2026-11-07T22:00:00Z");
const source="ci-tur011-rights-source";
function draft(slug:string,fromSource=source){
 return {
 type:"news" as const,slug,
 title:"Synthetic TUR011 concurrency article "+slug,
 summary:"Synthetic-only content used to exercise race and revocation consistency.",
 body:"This noncommercial test article has no relation to any real phone, merchant, offer or news event. It exists only in an ephemeral PostgreSQL CI schema to verify race, rights and cache delivery behavior.",
 language:"tr",observedAt:"2026-11-07T21:50:00Z",sources:[fromSource]
 };
}
test("transactional rights/issuer revocation races, idempotent receipts and R2 integrity",async()=>{
 const root=new pg.Pool({connectionString:url,max:2});
 await root.query("CREATE SCHEMA IF NOT EXISTS "+schema);
 const db=new pg.Pool({connectionString:url,options:"-c search_path="+schema,max:24});
 try{
  for(const file of [
    "0003_content_cms.sql","0004_cms_delivery.sql",
    "0005_cms_trusted_attestations.sql","0006_cms_security.sql",
    "0007_cms_queue_receipts.sql","0011_cms_queue_receipt_hash.sql","0008_cms_issuer_lifecycle.sql","0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql"
  ])await db.query(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  await db.query(
    "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by,reviewed_at) VALUES($1,'manufacturer','SYNTHETIC_RIGHTS_ONLY','CI synthetic source','https://example.org/synthetic-ci-license',true,'Independent CI Reviewer',$2)",
    [source,now]);

  const records=[];
  const repo=new CmsRepository(db);
  for(let i=0;i<12;i++){
   const article=await repo.submit("ci-tur011-race-"+i,draft("ci-tur011-race-"+i));
   await db.query(
     "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author,verified_at) VALUES($1,1,true,true,true,true,'CI Manual Reviewer','Synthetic Test Editor',$2)",
     [article.id,now]);
   assert.equal((await repo.publish(article.id,1,now)).state,"published");
   records.push(article.id);
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages")).rows[0].n,12);
  const rights=await Promise.all(Array.from({length:8},()=>revokeLicensedResource(
    db,"source",source,"CI_AUTHORIZED_LICENSE_TERMINATION_20261108","CI Rights Administrator")));
  assert.equal(rights.reduce((n,r)=>n+r.withdrawn,0),12,
    "overlapping revocation callers must not double-withdraw");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages")).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_delivery_outbox WHERE event_kind='withdrawn'")).rows[0].n,12);
  for(const id of records){
   assert.equal((await db.query(
     "SELECT count(*)::int AS n FROM cms_delivery_outbox WHERE submission_id=$1 AND event_kind='withdrawn'",[id])).rows[0].n,1);
  }

  const auth="ci-tur011-issuer";
  const key=temporaryCiIssuer();
  await db.query(
    "INSERT INTO cms_review_authorities(id,active,reviewer_class,public_key_pem) VALUES($1,true,'licensed_verifier',$2)",
    [auth,key.publicPem]);
  const secondSource="ci-tur011-issuer-source";
  await db.query(
    "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by) VALUES($1,'manufacturer','SYNTHETIC_ISSUER_LICENSE','CI second source','https://example.org/issuer-test',true,'Independent CI Reviewer')",
    [secondSource]);
  const pipeline=createCmsAuthorizedPipeline(db,{async send(){}},()=>now);
  const issuerRows=[];
  for(let i=0;i<8;i++){
    const record=await pipeline.repository.submit("ci-tur011-issuer-"+i,
      draft("ci-tur011-issuer-"+i,secondSource));
    for(const type of ["editorial","originality"]){
      await addVerifiedAttestation(db,{
        submissionId:record.id,revision:1,type,
        authorityId:auth,privateKey:key.privateKey,verifiedAt:now
      });
    }
    assert.equal((await pipeline.process(record.id,1)).state,"published");
    issuerRows.push(record.id);
  }
  const results=await Promise.all(Array.from({length:6},()=>
    revokeIssuerAuthority(db,auth,"CI_SIGNING_KEY_COMPROMISE_20261108","CI Security Officer")));
  assert.equal(results.reduce((n,x)=>n+x.withdrawn,0),8);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_public_pages")).rows[0].n,0);
  assert.equal((await reconcileInvalidIssuerPublications(db)).withdrawn,0);

  // Thirty-two concurrent deliveries compete for the SAME durable receipt:
  // successful external purge is never reported by more than one claimant.
  const receipts=makeReceiptStore(async(sql,args)=>(await db.query(sql,args)).rows);
  const event={
    eventId:"11111111-1111-4111-8111-111111111111",
    submissionId:records[0],revision:2,kind:"withdrawn",
    routes:["/haberler/ci-tur011-race-0","/haberler","/"]
  };
  let purgeCount=0,ackCount=0,retryCount=0;
  await Promise.all(Array.from({length:32},(_,i)=>{
    const msg={
      body:event,attempts:1,
      ack(){ackCount++},
      retry(){retryCount++}
    };
    return consumeCmsPurgeBatch({messages:[msg]},async()=>{
      purgeCount++;
      await new Promise(resolve=>setTimeout(resolve,20));
    },receipts);
  }));
  assert.equal(purgeCount,1,"durable claim must guard duplicate parallel CDN purge");
  assert.equal(await receipts.status(event.eventId),"completed");
  assert.equal(ackCount+retryCount,32);
  assert.ok(ackCount>=1);

  // Verify that BOTH validity and fail-closed tampering survive concurrent
  // R2-like in-memory object calls, without a real R2 account.
  const bytes=makeSyntheticPng(48,32),objects=new Map();
  const bucket={
    async put(key,raw,metadata){objects.set(key,{raw,metadata})},
    async get(key){
      const obj=objects.get(key);
      if(!obj)return null;
      return {
        size:obj.raw.length,body:new Response(obj.raw).body,
        customMetadata:obj.metadata.customMetadata,
        httpMetadata:obj.metadata.httpMetadata
      };
    }
  };
  const media=await stageLicensedMedia(bucket,"ci-tur011-concurrency-png",bytes,{
    rightsApproved:true,evidenceRef:"SYNTHETIC_ORIGINAL_CI_PIXELS_ONLY",reviewer:"Independent CI"
  });
  const asset={
    id:media.assetId,key:media.key,bytes:media.bytes,sha256Hex:media.sha256,
    contentType:media.contentType,rightsApproved:true
  };
  const read=()=>handleCmsMedia(new Request("https://ci.example.invalid/v1/media/ci-tur011-concurrency-png"),{
    findApprovedAsset:async()=>asset,bucket
  });
  const initial=await Promise.all(Array.from({length:16},()=>read()));
  assert.ok(initial.every(r=>r.status===200));
  const corrupted=objects.get(media.key);
  corrupted.raw=Uint8Array.from(corrupted.raw);
  corrupted.raw[corrupted.raw.length-16]^=128;
  const denied=await Promise.all(Array.from({length:16},()=>read()));
  assert.ok(denied.every(r=>r.status===503),"forged R2 bytes must never be served");
 }finally{
  await db.end();
  await root.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  await root.end();
 }
});
