import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isUuid, verifiedMerchantUrl, isFreshObservation, publicOffers, MAX_AGE_MS
} from "../services/prices-worker/src/policy.mjs";

const now = new Date("2026-11-07T18:00:00.000Z");
const variantId = "11111111-1111-4111-8111-111111111111";
const offerId = "22222222-2222-4222-8222-222222222222";

function candidate(patch = {}) {
  return {
    offer: {
      id: offerId,
      deviceVariantId: variantId,
      productUrl: "https://store.example.com/product/phone?sku=1",
      publishingStatus: "published",
      currency: "TRY",
      market: "TR",
      affiliate: false,
      ...patch.offer
    },
    merchant: {
      displayName: "Kurgusal Satıcı",
      market: "TR",
      rightsStatus: "approved",
      rightsEvidenceRef: "synthetic-evidence",
      affiliateProgramStatus: "none",
      ...patch.merchant
    },
    hosts: ["store.example.com"],
    observation: {
      productPriceMinor: 100000,
      mandatoryShippingMinor: 499,
      taxIncluded: true,
      stockStatus: "available",
      evidenceRef: "synthetic-source",
      collectionMethod: "authorized_feed",
      verificationStatus: "verified",
      observedAt: "2026-11-07T17:00:00.000Z",
      ...patch.observation
    },
    ...Object.fromEntries(Object.entries(patch).filter(([name]) => !["offer", "merchant", "observation"].includes(name)))
  };
}

test("route keys use exact UUIDs; no generic SQL/search string", () => {
  assert.equal(isUuid(variantId), true);
  for (const value of ["", "123", "1' OR 1=1", variantId + "/more", null]) {
    assert.equal(isUuid(value), false);
  }
});

test("seller links require verified exact host, TLS, no credentials, ports or fragments", () => {
  const allowed = ["store.example.com"];
  assert.equal(verifiedMerchantUrl("https://store.example.com/p?id=4", allowed), "https://store.example.com/p?id=4");
  for (const address of [
    "http://store.example.com/p",
    "https://store.example.com.evil.net/p",
    "https://store.example.com@evil.net/p",
    "https://evil.net@store.example.com/p",
    "https://store.example.com:8443/p",
    "https://store.example.com/p#fragment",
    "javascript:alert(1)",
    "https://localhost/p",
    "https://127.0.0.1/p",
    "https://store.example.com.evil.net",
    "//store.example.com/p",
    "https://store.example.com.invalid/p"
  ]) {
    assert.equal(verifiedMerchantUrl(address, allowed), null, address);
  }
  assert.equal(verifiedMerchantUrl("https://store.example.com/p", []), null);
  assert.equal(verifiedMerchantUrl("https://store.example.com/p", ["other.example.com"]), null);
});

test("stale/future snapshots are suppressed; publication is not a live-price guarantee", () => {
  assert.equal(isFreshObservation("2026-11-07T17:00:00Z", now), true);
  assert.equal(isFreshObservation(new Date(now.getTime() - MAX_AGE_MS - 1), now), false);
  assert.equal(isFreshObservation(new Date(now.getTime() + 5 * 60 * 1000 + 1), now), false);
  assert.equal(publicOffers([candidate({ observation: { observedAt: "2026-11-06T09:00:00Z" } })], now).length, 0);
  assert.equal(publicOffers([candidate({ observation: { observedAt: "2030-01-01T00:00:00Z" } })], now).length, 0);
});

test("published, permission-cleared, comparable total price only", () => {
  const results = publicOffers([candidate()], now);
  assert.equal(results.length, 1);
  assert.equal(results[0].totalPriceMinor, 100499);
  assert.equal(results[0].currency, "TRY");
  assert.equal(results[0].purchaseUrl, "https://store.example.com/product/phone?sku=1");
  assert.equal(results[0].affiliate, false);
  assert.ok(!("evidenceRef" in results[0]), "private evidence reference not leaked");
});

test("missing rights, unsafe stock, unknown shipping, invalid tax, unreviewed snapshot => no public offer", () => {
  const denied = [
    {merchant: { rightsStatus: "pending" }},
    {merchant: { rightsEvidenceRef: null }},
    {offer: { publishingStatus: "draft" }},
    {offer: { currency: "USD" }},
    {offer: { affiliate: true }},
    {observation: { stockStatus: "out_of_stock" }},
    {observation: { taxIncluded: false }},
    {observation: { mandatoryShippingMinor: null }},
    {observation: { mandatoryShippingMinor: -1 }},
    {observation: { productPriceMinor: Number.MAX_SAFE_INTEGER }},
    {observation: { evidenceRef: "" }},
    {observation: { collectionMethod: "unlicensed_scrape" }},
    {observation: { verificationStatus: "quarantined" }},
    {hosts: ["not-merchant.example.com"]},
    {offer: { productUrl: "https://store.example.com.evil.com/p" }}
  ];
  for (const patch of denied) {
    assert.deepEqual(publicOffers([candidate(patch)], now), [], JSON.stringify(patch));
  }
});

test("affiliate needs explicit approved merchant program and has a disclosure flag", () => {
  const approved = candidate({
    offer: { affiliate: true },
    merchant: { affiliateProgramStatus: "approved" }
  });
  assert.equal(publicOffers([approved], now)[0].affiliate, true);
});

test("organic sort uses delivered price, never affiliate or base price", () => {
  const cheaperBaseHigherShipping = candidate({
    offer: {id: "33333333-3333-4333-8333-333333333333"},
    merchant: {displayName: "B satıcı"},
    observation: {productPriceMinor: 97000, mandatoryShippingMinor: 9999}
  });
  const lowerTotal = candidate({
    merchant: {displayName: "A satıcı"},
    observation: {productPriceMinor: 99000, mandatoryShippingMinor: 0}
  });
  assert.deepEqual(publicOffers([cheaperBaseHigherShipping, lowerTotal], now)
    .map((entry) => entry.merchant), ["A satıcı", "B satıcı"]);
});

test("database migration and worker endpoint must not contain real merchant seeds or public writes", () => {
  const migration = readFileSync(new URL("../services/prices-worker/migrations/0001_price_core.sql", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../services/prices-worker/src/index.ts", import.meta.url), "utf8");
  for (const table of ["merchants", "merchant_domains", "merchant_offers", "price_observations", "device_variants"]) {
    assert.match(migration, new RegExp("CREATE TABLE " + table));
  }
  assert.doesNotMatch(migration, /INSERT\s+INTO\b/i);
  assert.match(entry, /request\.method !== "GET"/);
  assert.match(entry, /no-store/);
  assert.match(entry, /env\.DATABASE_URL/);
  assert.doesNotMatch(entry, /console\.log|console\.error/);
});
