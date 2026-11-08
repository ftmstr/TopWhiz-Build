import {makeSyntheticPng} from "./fixtures/png-factory.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";
import { CmsRepository } from "../src/cms/repository";
import { createCmsAuthorizedPipeline } from "../src/cms/authorized-pipeline";
import { handlePrivateCmsIntake } from "../src/cms/private-intake.mjs";
import { handlePublicCmsRequest } from "../src/cms/public-http.mjs";
import { publicCmsListSql, publicCmsDetailSql, publicMediaAssetSql } from "../src/cms/public-sql.mjs";
import { handleCmsMedia } from "../src/cms/media-handler.mjs";
import { stageLicensedMedia,consumeCmsPurgeBatch } from "../src/cms/cloudflare-adapters.mjs";
import {temporaryCiIssuer,addVerifiedAttestation} from "./fixtures/ci-issuer";

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw Error("TEST_DATABASE_URL required; refusing silent CI skip");
const fixedNow=new Date("2026-11-07T22:00:00Z");
const secret="CI-SYNTHETIC-INTERNAL-INTAKE-SECRET-123456";
const imgBytes=makeSyntheticPng();
const article={
  type:"news" as const,slug:"sentetik-otomatik-yayin",
  title:"Sentetik haber: güvenli otomatik yayın testi",
  summary:"Gerçek bir duyuru olmayan bu sentetik haber, yayın zincirinin doğrulanmasını sağlayan CI kaydıdır.",
  body:"Bu haber yalnızca otomatik entegrasyon testidir. Bir gerçek marka, telefon veya ticari mağaza hakkında haber niteliğinde hiçbir iddia barındırmaz. Üçüncü taraf haklarını taklit etmez ve yalnızca doğrulama akışının güvenlik koşullarını ölçer.",
  language:"tr",observedAt:"2026-11-07T21:30:00Z",sources:["ci-source-01"],coverMediaId:"ci-hero"
};
const phone={
  type:"phone" as const,slug:"sentetik-ci-cihaz",
  title:"Sentetik CI Telefonu — 256 GB",
  summary:"Gerçek olmayan telefon kaydı; teknik özellik kaynak eşlemesi ve genel katalog görüntüsünü test eder.",
  brand:"Synthetic Manufacturer",modelCode:"SYNTH-CI-01",market:"TR",language:"tr",
  observedAt:"2026-11-07T21:30:00Z",sources:["ci-source-01"],coverMediaId:"ci-hero",
  variants:[{name:"Test 8+256",ramGb:8,storageGb:256,warrantyClass:"synthetic warranty"}],
  specifications:[{label:"RAM",value:"8 GB (synthetic)",sourceId:"ci-source-01"}]
};
test("SINGLE ENTRY → trusted evidence → real PostgreSQL publish → public HTTP → R2 → Queue → withdraw",async()=>{
  const admin=new pg.Pool({connectionString,max:1});
  await admin.query("CREATE SCHEMA IF NOT EXISTS tur007_e2e_ci");
  const db=new pg.Pool({connectionString,options:"-c search_path=tur007_e2e_ci",max:4});
  const publisher=new CmsRepository(db);
  const issuer=temporaryCiIssuer();
  let sendFails=true;
  const sent:any[]=[];
  const queue={async send(value:any){if(sendFails)throw Error("synthetic_queue_offline");sent.push(value)}};
  const pipeline=createCmsAuthorizedPipeline(db,queue,()=>fixedNow);
  const r2=new Map<string,{bytes:Uint8Array;meta:any}>();
  const bucket={
    async put(key:string,bytes:Uint8Array,meta:any){r2.set(key,{bytes,meta})},
    async get(key:string){const v=r2.get(key);return v?{
      size:v.bytes.length,
      body:new Response(v.bytes).body,
      customMetadata:v.meta.customMetadata,
      httpMetadata:v.meta.httpMetadata
    }:null}
  };
  const readContent=async(kind:string,slug?:string)=>{
    const sql=slug===undefined?publicCmsListSql:publicCmsDetailSql;
    const params=slug===undefined?[kind]:[kind,slug];
    const rows=(await db.query(sql,params)).rows;
    return slug===undefined?rows:rows[0]??null;
  };
  const findAsset=async(id:string)=>(await db.query(publicMediaAssetSql,[id])).rows[0]??null;
  async function grantEvidence(contentId:string,revision:number,types:string[]){
    for(const type of types){
      await addVerifiedAttestation(db,{submissionId:contentId,revision,type,
        authorityId:"ci-trusted-authority",privateKey:issuer.privateKey,verifiedAt:fixedNow});
    }
  }
  async function ingest(externalKey:string,content:unknown){
    const response=await handlePrivateCmsIntake(new Request("https://private.example.org/internal/cms/submit",{
      method:"POST",headers:{"Authorization":"Bearer "+secret,"Content-Type":"application/json"},
      body:JSON.stringify({externalKey,content})
    }),{repository:publisher,intakeSecret:secret});
    assert.equal(response.status,202);
    return response.json();
  }
  async function getPublic(route:string){
    const res=await handlePublicCmsRequest(new Request("https://cms.example.org"+route),readContent);
    return {status:res.status,payload:await res.json()};
  }
  try{
    for(const file of ["0003_content_cms.sql","0004_cms_delivery.sql","0005_cms_trusted_attestations.sql","0006_cms_security.sql","0008_cms_issuer_lifecycle.sql","0009_cms_publication_rollback.sql","0010_cms_cache_fences.sql"]){
      const source=readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8");
      await db.query(source);
    }
    const staged=await ingest("ci-autopublish-news",article);
    assert.equal(staged.state,"pending_review");
    assert.equal((await getPublic("/v1/content?type=news")).payload.items.length,0);

    // A model's self-reported approval cannot make the first version public.
    const denied=await pipeline.process(staged.id,1);
    assert.equal(denied.state,"pending_review");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_review_grants")).rows[0].n,0);

    const mediaReceipt=await stageLicensedMedia(bucket,"ci-hero",imgBytes,{
      rightsApproved:true,evidenceRef:"SYNTHETIC_MEDIA_LICENSE_CI",reviewer:"CI Independent Reviewer"
    });
    await db.query(
      "INSERT INTO cms_media_assets(id,r2_key,content_type,bytes,sha256_hex,alt_text,license_evidence_ref,rights_approved,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,'Synthetic blank PNG','CI_GENERATED_SYNTHETIC_RIGHTS',true,'CI Independent Reviewer',$6)",
      ["ci-hero",mediaReceipt.key,mediaReceipt.contentType,mediaReceipt.bytes,mediaReceipt.sha256,fixedNow]);
    await db.query(
      "INSERT INTO cms_trusted_sources(id,source_type,rights_ref,source_label,source_url,rights_approved,reviewed_by,reviewed_at) VALUES('ci-source-01','manufacturer','CI_SYNTHETIC_SOURCE_RIGHTS','CI Synthetic Source','https://example.org/ci-test-document',true,'CI Independent Reviewer',$1)",
      [fixedNow]);
    await db.query(
      "INSERT INTO cms_review_authorities(id,active,reviewer_class,public_key_pem) VALUES('ci-trusted-authority',true,'licensed_verifier',$1)",[issuer.publicPem]);
    await grantEvidence(staged.id,1,["editorial","originality"]);

    const published=await pipeline.process(staged.id,1);
    assert.equal(published.state,"published");
    assert.equal(published.cacheDelivery,"pending_retry");
    assert.equal((await publisher.pendingOutbox()).length,1);

    const newsList=await getPublic("/v1/content?type=news");
    assert.equal(newsList.status,200);
    assert.equal(newsList.payload.items.length,1);
    assert.equal(newsList.payload.items[0].content.title,article.title);
    assert.equal(newsList.payload.items[0].content.author,"CI Synthetic Author");
    assert.equal(newsList.payload.items[0].mediaPath,"/media/cms/ci-hero");
    const detail=await getPublic("/v1/content/news/sentetik-otomatik-yayin");
    assert.equal(detail.status,200);
    assert.deepEqual(detail.payload.item.content.sources,
      [{label:"CI Synthetic Source",url:"https://example.org/ci-test-document"}]);
    const image=await handleCmsMedia(new Request("https://cms.example.org/v1/media/ci-hero"),
      {findApprovedAsset:findAsset,bucket});
    assert.equal(image.status,200);
    assert.deepEqual(new Uint8Array(await image.arrayBuffer()),imgBytes);

    // Queue disruption cannot lose a committed publication or outbox event.
    sendFails=false;
    assert.equal((await pipeline.relayPending()).delivered,1);
    assert.equal((await publisher.pendingOutbox()).length,0);
    const purged:string[]=[];
    const acknowledgments:string[]=[];
    await consumeCmsPurgeBatch({messages:sent.map(body=>({
      body,ack(){acknowledgments.push("ack")},retry(){acknowledgments.push("retry")}
    }))},async routes=>{purged.push(...routes)});
    assert.ok(purged.includes("/haberler/sentetik-otomatik-yayin"));
    assert.deepEqual(acknowledgments,["ack"]);

    const phoneStaged=await ingest("ci-autopublish-phone",phone);
    assert.equal((await pipeline.process(phoneStaged.id,1)).state,"pending_review");
    await grantEvidence(phoneStaged.id,1,["editorial","originality","specifications"]);
    const phonePublished=await pipeline.process(phoneStaged.id,1);
    assert.equal(phonePublished.state,"published");
    const phones=await getPublic("/v1/content?type=phone");
    assert.equal(phones.payload.items.length,1);
    assert.equal(phones.payload.items[0].content.specifications[0].sourceLabel,"CI Synthetic Source");
    assert.equal(phones.payload.items[0].content.specifications[0].sourceId,undefined);
    const phoneDetail=await getPublic("/v1/content/phone/sentetik-ci-cihaz");
    assert.equal(phoneDetail.status,200);
    assert.equal(phoneDetail.payload.item.content.modelCode,"SYNTH-CI-01");

    // Withdrawal hides all public snapshots; R2 stays private after final link withdrawn.
    const newsWithdrawn=await publisher.withdraw(staged.id,1);
    assert.equal(newsWithdrawn.state,"withdrawn");
    assert.equal((await getPublic("/v1/content/news/sentetik-otomatik-yayin")).status,404);
    assert.equal((await getPublic("/v1/content?type=news")).payload.items.length,0);
    assert.equal((await handleCmsMedia(new Request("https://cms.example.org/v1/media/ci-hero"),{
      findApprovedAsset:findAsset,bucket})).status,200); // phone still legitimately references it
    await publisher.withdraw(phoneStaged.id,1);
    assert.equal((await getPublic("/v1/content?type=phone")).payload.items.length,0);
    assert.equal((await getPublic("/v1/content/phone/sentetik-ci-cihaz")).status,404);
    assert.equal((await handleCmsMedia(new Request("https://cms.example.org/v1/media/ci-hero"),{
      findApprovedAsset:findAsset,bucket})).status,404);
    const pending=await pipeline.relayPending();
    assert.equal(pending.delivered,2);
    assert.equal((await publisher.pendingOutbox()).length,0);
    assert.equal((await getPublic("/v1/content?type=wrong")).status,400);
    // Everything above is ephemeral, synthetic and never deployed.
  }finally{
    await db.end();
    await admin.query("DROP SCHEMA IF EXISTS tur007_e2e_ci CASCADE");
    await admin.end();
  }
});
