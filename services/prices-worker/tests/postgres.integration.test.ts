import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import {
  deviceVariants, merchants, merchantDomains, merchantOffers, priceObservations,
  stagedPriceRecords, sourceImportBatches
} from "../src/db/schema";
import { stageFeedBatch } from "../src/ingestion/stage";

const connectionString=process.env.TEST_DATABASE_URL;
if (!connectionString) throw Error("TEST_DATABASE_URL required; refusing silent skip");
const pool=new pg.Pool({connectionString,max:3});
const db=drizzle(pool);
const fixtureNow = new Date("2026-11-07T18:00:00Z");

test("migrations + Drizzle inserts + rights-gated staging persist to isolated PostgreSQL", async (t)=>{
  try {
    for(const name of ["0001_price_core.sql","0002_staging.sql"]){
      const source=readFileSync(new URL("../migrations/"+name, import.meta.url),"utf8");
      await pool.query(source);
    }
    const [device]=await db.insert(deviceVariants).values({
      brand:"Fictional Manufacturer",modelCode:"TEST-PHONE",market:"TR",
      ramGb:8,storageGb:256,colorCode:"black",itemCondition:"new",warrantyClass:"test"
    }).returning();
    const [merchant]=await db.insert(merchants).values({
      displayName:"Synthetic Merchant",market:"TR",rightsStatus:"approved",
      rightsEvidenceRef:"SYNTHETIC_TEST_CONTRACT"
    }).returning();
    const [domain]=await db.insert(merchantDomains).values({
      merchantId:merchant.id,hostname:"seller.example.org",verificationStatus:"verified",
      verificationEvidenceRef:"SYNTHETIC_TEST_DOMAIN",verifiedAt:fixtureNow
    }).returning();
    assert.ok(device.id && merchant.id && domain.id);
    const item={
      externalOfferId:"synthetic-sku",deviceVariantId:device.id,
      productUrl:"https://seller.example.org/test-item",
      productPriceMinor:150000,mandatoryShippingMinor:0,
      currency:"TRY",market:"TR",taxIncluded:true,stockStatus:"available",
      observedAt:"2026-11-07T17:00:00Z",sourceRecordRef:"synthetic-test-ref"
    };
    const result=await stageFeedBatch(db,{
      sourceBatchKey:"test-batch-001",merchantId:merchant.id,
      collectionMethod:"authorized_feed",rows:[item,{...item,externalOfferId:"bad-2",productUrl:"https://evil.example.net/item"},item]
    },fixtureNow);
    assert.equal(result.staged,1);
    assert.equal(result.quarantined,2);
    assert.equal(result.published,0);
    const stored=await db.select().from(stagedPriceRecords);
    assert.deepEqual(stored.map(v=>v.validationStatus).sort(),["pending_review","quarantined","quarantined"].sort());
    assert.equal((await db.select().from(merchantOffers)).length,0);
    assert.equal((await db.select().from(priceObservations)).length,0);
    await assert.rejects(
      ()=>stageFeedBatch(db,{
        sourceBatchKey:"test-batch-001",merchantId:merchant.id,
        collectionMethod:"authorized_feed",rows:[item]
      },fixtureNow)
    );
    assert.equal((await db.select().from(sourceImportBatches).where(eq(sourceImportBatches.merchantId,merchant.id))).length,1);
    await assert.rejects(
      ()=>db.insert(deviceVariants).values({
        brand:"Fictional Manufacturer",modelCode:"TEST-PHONE",market:"TR",
        ramGb:8,storageGb:256,colorCode:"black",itemCondition:"new",warrantyClass:"test"
      })
    );
    t.diagnostic("Real PostgreSQL constraints, Drizzle inserts, staged rights and quarantine verified. NO publication.");
  } finally { await pool.end(); }
});
