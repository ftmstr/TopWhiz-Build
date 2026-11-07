import test from "node:test";
import assert from "node:assert/strict";
import { validateStagingBatch, validateStagingRow } from "../services/prices-worker/src/ingestion/validate.mjs";

const time = new Date("2026-11-07T18:00:00Z");
const context = {
  merchantId: "11111111-1111-4111-8111-111111111111",
  collectionMethod: "authorized_feed",
  rightsStatus: "approved",
  rightsEvidenceRef: "contract-verified-by-owner",
  verifiedHosts: ["seller.example.org"]
};
function row() {
  return { externalOfferId: "sku_123",
    deviceVariantId: "22222222-2222-4222-8222-222222222222",
    productUrl: "https://seller.example.org/p/something",
    productPriceMinor: 799900, mandatoryShippingMinor: 0,
    currency: "TRY", market: "TR", taxIncluded: true,
    stockStatus: "available",
    observedAt: "2026-11-07T17:00:00Z",
    sourceRecordRef: "source-record-verified"};
}
test("valid synthetic feed can only advance to pending_review, never published",()=>{
  assert.deepEqual(validateStagingRow(row(),context,time),{status:"pending_review",reasons:[]});
});
test("a feed's claimed rights never override verified merchant context",()=>{
  const invalid = validateStagingRow({...row(),rightsStatus:"approved"},
    {...context,rightsStatus:"blocked",rightsEvidenceRef:""},time);
  assert.equal(invalid.status,"quarantined");
  assert.ok(invalid.reasons.includes("rights_not_approved"));
});
test("invalid price/tax/host/source/clock rows are quarantined",()=>{
  const edits=[
    [{productPriceMinor:0},"invalid_total_price"],
    [{mandatoryShippingMinor:null},"invalid_total_price"],
    [{taxIncluded:false},"tax_unknown"],
    [{productUrl:"https://seller.example.org.evil.com/p"},"unverified_merchant_url"],
    [{observedAt:"2026-11-06T17:00:00Z"},"stale_or_future_observation"],
    [{observedAt:"2030-11-06T17:00:00Z"},"stale_or_future_observation"],
    [{sourceRecordRef:""},"missing_source_reference"],
    [{stockStatus:"out_of_stock"},"unavailable_stock"]
  ];
  for(const [patch,reason] of edits){
    const result=validateStagingRow({...row(),...patch},context,time);
    assert.equal(result.status,"quarantined",JSON.stringify(patch));
    assert.ok(result.reasons.includes(reason),JSON.stringify(patch));
  }
});
test("duplicate external SKU is quarantined and batch overflow is rejected",()=>{
  const results=validateStagingBatch([row(),row()],context,time);
  assert.equal(results[0].status,"pending_review");
  assert.equal(results[1].status,"quarantined");
  assert.ok(results[1].reasons.includes("duplicate_external_offer_id"));
  assert.throws(()=>validateStagingBatch([],context,time),/invalid_batch_size/);
  assert.throws(()=>validateStagingBatch(Array.from({length:201},row),context,time),/invalid_batch_size/);
});
