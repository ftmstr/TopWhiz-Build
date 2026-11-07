import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync(new URL("../apps/web/data/demo-catalog.json", import.meta.url), "utf8"));
const offers = JSON.parse(readFileSync(new URL("../apps/web/data/demo-price-offers.json", import.meta.url), "utf8"));
const ids = new Set(catalog.map((device) => device.id));

test("demo price offers have valid variants and no false retailer links", () => {
  assert.ok(offers.length >= 3);
  assert.equal(new Set(offers.map((offer) => offer.id)).size, offers.length);
  for (const offer of offers) {
    assert.ok(ids.has(offer.deviceId), "missing matching device");
    assert.ok(typeof offer.variant === "string" && offer.variant.length > 0);
    assert.ok(typeof offer.merchant === "string" && offer.merchant.startsWith("Örnek "));
    assert.ok(Number.isFinite(offer.price) && offer.price > 0);
    assert.ok(Number.isFinite(offer.shipping) && offer.shipping >= 0);
    assert.equal(offer.currency, "TRY");
    assert.equal(offer.market, "TR");
    assert.equal(offer.recordState, "demo");
    assert.equal(offer.purchaseUrl, null, "demo must not link to real sellers");
    assert.equal(offer.affiliate, false);
    assert.ok(Number.isFinite(Date.parse(offer.observedAt)));
  }
});

test("total price including mandatory shipping determines organic order", () => {
  const max = offers.filter((offer) => offer.deviceId === "orion-max")
    .sort((a,b) => (a.price + a.shipping) - (b.price + b.shipping));
  assert.deepEqual(max.map((offer) => offer.id), ["demo-max-a", "demo-max-b", "demo-max-c"]);
});

test("non-listed device has a clear empty state instead of invented prices", () => {
  assert.equal(offers.filter((offer) => offer.deviceId === "vega-lite").length, 0);
});
