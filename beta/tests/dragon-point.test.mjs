import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDragonPoint, DRAGON_METHOD, METRICS, syntheticFixture } from "../assets/dragon-point.mjs";

const genuine = (metric, value, unit, benchmark) => ({
  metric, value, unit,
  evidence: {
    kind: "INDEPENDENT",
    verified: true,
    licenseStatus: "PERMITTED",
    deviceId: "phone-1",
    variantId: "tr",
    sourceUrl: "https://example.org/tests/reference",
    measuredAt: "2026-11-10",
    ...(benchmark ? { benchmark } : {})
  }
});

const evaluateAt = input => evaluateDragonPoint({ asOfDate: "2026-11-14", ...input });

test("DP 1.0: 8 categories sum to 1000, metric weights reconcile without duplicates", () => {
  assert.equal(Object.values(DRAGON_METHOD.categoryWeights).reduce((a, b) => a + b, 0), 1000);
  assert.equal(METRICS.length, 37);
  assert.equal(new Set(METRICS.map(m => m.id)).size, METRICS.length);
  for (const [category, weight] of Object.entries(DRAGON_METHOD.categoryWeights)) {
    assert.equal(METRICS.filter(m => m.category === category).reduce((a, b) => a + b.weight, 0), weight);
  }
  assert.equal(DRAGON_METHOD.status, "DRAFT_CALIBRATION");
  assert.equal(DRAGON_METHOD.version, "1.0.1-draft");
});

test("empty evidence is never a scored phone or a published ranking", () => {
  const result = evaluateAt({ deviceId: "phone-1", variantId: "tr", observations: [] });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.totalScore, null);
  assert.equal(result.coverage, 0);
  assert.deepEqual(result.scoreRange, [0, 1000]);
  assert.equal(result.publishable, false);
});

test("measured PPI is capped, but missing metrics are NOT treated as zeros", () => {
  const result = evaluateAt({
    deviceId: "phone-1", variantId: "tr",
    observations: [genuine("display.ppi", 520, "ppi")]
  });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.categoryScores.display.knownPoints, 20);
  assert.equal(result.categoryScores.display.coverage, 20 / 175);
  assert.equal(result.scoreRange[0], 20);
  assert.equal(result.scoreRange[1], 1000);
  assert.equal(result.totalScore, null);
});

test("differing benchmark major version fails closed", () => {
  const result = evaluateAt({
    deviceId: "phone-1", variantId: "tr",
    observations: [genuine("performance.cpu_single", 2850, "points", { suite: "Geekbench", major: 5, mode: "single" })]
  });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.totalScore, null);
  assert.match(result.issues.join(" "), /benchmark/i);
});

test("correct benchmark protocol can be evaluated without implying full coverage", () => {
  const result = evaluateAt({
    deviceId: "phone-1", variantId: "tr",
    observations: [genuine("performance.cpu_single", 3100, "points", { suite: "Geekbench", major: 6, mode: "single" })]
  });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.ok(result.categoryScores.performance.knownPoints > 0);
  assert.equal(result.publishable, false);
});

test("identical metric duplicates are rejected, not double counted", () => {
  const ppi = genuine("display.ppi", 450, "ppi");
  const result = evaluateAt({ deviceId: "phone-1", variantId: "tr", observations: [ppi, ppi] });
  assert.equal(result.status, "REJECTED");
  assert.match(result.issues.join(" "), /duplicate/i);
});

test("untrusted manual normalized scores and malformed values fail closed", () => {
  const bogus = genuine("display.ppi", 9999, "ppi");
  bogus.normalized = 1;
  const bad = evaluateAt({ deviceId: "phone-1", variantId: "tr", observations: [bogus] });
  assert.equal(bad.status, "REJECTED");
  const notFinite = evaluateAt({
    deviceId: "phone-1", variantId: "tr",
    observations: [genuine("display.ppi", Number.POSITIVE_INFINITY, "ppi")]
  });
  assert.equal(notFinite.status, "REJECTED");
});

test("license and source provenance are mandatory for real measurements", () => {
  const a = genuine("display.brightness", 1100, "nit");
  a.evidence.licenseStatus = "UNKNOWN";
  const b = genuine("display.refresh", 120, "Hz");
  b.evidence.sourceUrl = "javascript:alert(1)";
  for (const observation of [a, b]) {
    const r = evaluateAt({ deviceId: "phone-1", variantId: "tr", observations: [observation] });
    assert.equal(r.status, "REJECTED");
  }
});

test("37 normalized FICTIONAL metrics produce a deterministic DEMO_ONLY number; never publishable", () => {
  const observations = syntheticFixture(0.75);
  const input = {deviceId: "fictional-orion", variantId: "demo", observations};
  const a = evaluateDragonPoint(input), b = evaluateDragonPoint(input);
  assert.deepEqual(a, b);
  assert.equal(a.status, "DEMO_ONLY");
  assert.equal(a.totalScore, 750);
  assert.equal(a.coverage, 1);
  assert.equal(a.publishable, false);
  assert.deepEqual(a.scoreRange, [750, 750]);
  assert.equal(a.categoryScores.performance.points, 187.5);
});

test("mixing real and synthetic evidence is rejected to prevent fake publication laundering", () => {
  const result = evaluateAt({
    deviceId: "phone-1", variantId: "tr",
    observations: [...syntheticFixture(0.5), genuine("display.ppi", 450, "ppi")]
  });
  assert.equal(result.status, "REJECTED");
});

test("invalid identifiers, metric unknowns and synthetic out-of-range fractions are rejected", () => {
  assert.equal(evaluateAt({ deviceId: "", variantId: "tr", observations: [] }).status, "REJECTED");
  assert.equal(evaluateAt({ deviceId: "x", variantId: "tr", observations: [{metric:"wrong",normalized:0.5,evidence:{kind:"SYNTHETIC"}}] }).status, "REJECTED");
  assert.equal(evaluateAt({ deviceId: "x", variantId: "tr", observations: syntheticFixture(1.01) }).status, "REJECTED");
});


test("real device evidence must use a caller-supplied deterministic as-of date", () => {
  const observation = genuine("display.ppi", 420, "ppi");
  const withoutAsOf = evaluateDragonPoint({
    deviceId:"phone-1", variantId:"tr", observations:[observation]
  });
  assert.equal(withoutAsOf.status,"REJECTED");
  assert.match(withoutAsOf.issues.join(" "),/as.of/i);
  const valid=evaluateAt({deviceId:"phone-1",variantId:"tr",observations:[observation]});
  assert.equal(valid.status,"INSUFFICIENT_DATA");
  assert.equal(valid.asOfDate,"2026-11-14");
});

test("future measurements and invalid as-of dates must be rejected deterministically", () => {
  const observation=genuine("display.ppi", 410,"ppi");
  observation.evidence.measuredAt="2026-11-15";
  const future=evaluateAt({deviceId:"phone-1",variantId:"tr",observations:[observation]});
  assert.equal(future.status,"REJECTED");
  assert.match(future.issues.join(" "),/future/i);
  const invalid=evaluateAt({
    asOfDate:"2026-02-30",deviceId:"phone-1",variantId:"tr",observations:[genuine("display.ppi",410,"ppi")]
  });
  assert.equal(invalid.status,"REJECTED");
});

test("evidence from another model or regional variant is not cross-credited", () => {
  for (const key of ["deviceId","variantId"]) {
    const observation=genuine("display.ppi",415,"ppi");
    observation.evidence[key]="unrelated-device";
    const result=evaluateAt({deviceId:"phone-1",variantId:"tr",observations:[observation]});
    assert.equal(result.status,"REJECTED");
    assert.match(result.issues.join(" "),/variant|device|identity/i);
  }
});

test("source URL validation rejects local/private hosts and credentials", () => {
  for (const url of [
    "https://localhost/measurement", "https://127.0.0.1/measured",
    "https://192.168.1.3/test", "https://10.0.0.8/a",
    "https://169.254.10.10/a", "https://[::1]/test",
    "https://user:pass@example.org/test"
  ]) {
    const observation=genuine("display.ppi",420,"ppi");
    observation.evidence.sourceUrl=url;
    const r=evaluateAt({deviceId:"phone-1",variantId:"tr",observations:[observation]});
    assert.equal(r.status,"REJECTED",url);
  }
});

test("scoring calibration, benchmark metadata and anchor tuples are immutable", () => {
  const ppi=METRICS.find(m=>m.id==="display.ppi");
  const benchmark=METRICS.find(m=>m.id==="performance.cpu_single");
  assert.equal(Object.isFrozen(ppi.calibration),true);
  assert.equal(Object.isFrozen(ppi.calibration.anchors),true);
  assert.equal(Object.isFrozen(ppi.calibration.anchors[0]),true);
  assert.equal(Object.isFrozen(benchmark.calibration.benchmark),true);
  assert.throws(()=>{ppi.calibration.anchors[0][1]=.99;},TypeError);
});


test("partial-score bounds round outward, never discard plausible fractional points", () => {
  const r=evaluateAt({
    deviceId:"phone-1",variantId:"tr",
    observations:[genuine("display.ppi",375,"ppi")]
  });
  assert.equal(r.categoryScores.display.knownPoints,14.5);
  assert.deepEqual(r.scoreRange,[14,995]);
  assert.equal(r.totalScore,null);
  assert.equal(r.publishable,false);
});
