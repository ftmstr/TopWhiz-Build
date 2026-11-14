import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assessDragonPointReadiness, presentDragonPoint } from "../release-gate.mjs";
import { evaluateDragonPoint, syntheticFixture } from "../engine.mjs";

test("DP production release gate counts all 37 metrics and refuses to certify draft anchors",()=>{
  const report=assessDragonPointReadiness();
  assert.equal(report.methodologyVersion,"1.0.1-draft");
  assert.equal(report.status,"BLOCKED");
  assert.equal(report.totalMetrics,37);
  assert.equal(report.uncalibratedMetrics.length,25);
  assert.equal(report.preliminaryMetrics.length,12);
  assert.equal(report.releaseReady,false);
  assert.equal(report.publicRankingPermitted,false);
  assert.equal(report.requiredCalibratedMetrics,37);
  assert.ok(report.blockers.includes("DRAFT_METHODOLOGY"));
  assert.ok(report.blockers.includes("UNCALIBRATED_METRICS"));
  assert.ok(report.blockers.includes("UNAPPROVED_REFERENCE_ANCHORS"));
  assert.ok(report.blockers.includes("RIGHTS_REVIEW_UNVERIFIED"));
  assert.ok(report.blockers.includes("PRODUCTION_RELEASE_NO_GO"));
});

test("release gate cannot be overridden by caller flags, fabricated score or claimed approvals",()=>{
  const claimed=assessDragonPointReadiness({status:"GO",approved:true,releaseReady:true});
  assert.equal(claimed.status,"BLOCKED");
  const forged=presentDragonPoint({
    status:"VERIFIED",publishable:true,methodologyVersion:"1.0.1-draft",totalScore:999,
    coverage:1,categoryScores:{}
  });
  assert.equal(forged.showNumericScore,false);
  assert.equal(forged.totalScore,null);
  assert.equal(forged.label,"Veri bekleniyor");
});

test("synthetic-only full-coverage scores remain hidden on real product page",()=>{
  const score=evaluateDragonPoint({
    deviceId:"fictional-phone",variantId:"demo",
    observations:syntheticFixture(.99)
  });
  assert.equal(score.totalScore,990);
  const presented=presentDragonPoint(score);
  assert.equal(presented.showNumericScore,false);
  assert.equal(presented.totalScore,null);
  assert.equal(presented.status,"UNAVAILABLE");
});

test("unknown, partial, and rejected measurements never surface fake exact totals",()=>{
  for(const r of [null,{}, {totalScore:897,publishable:false},
    {status:"REJECTED",totalScore:15,publishable:true},
    evaluateDragonPoint({deviceId:"phone",variantId:"tr",observations:[]})
  ]){
    const p=presentDragonPoint(r);
    assert.equal(p.totalScore,null);
    assert.equal(p.showNumericScore,false);
    assert.equal(p.status,"UNAVAILABLE");
  }
});

test("real Next.js phone detail integrates permanent no-score card without fictional benchmark claims",()=>{
  const src=readFileSync(fileURLToPath(new URL("../../../apps/web/app/telefonlar/[slug]/page.tsx",import.meta.url)),"utf8");
  const card=readFileSync(fileURLToPath(new URL("../../../apps/web/components/dragon-point-card.tsx",import.meta.url)),"utf8");
  assert.match(src,/DragonPointCard/);
  assert.match(card,/DRAGON POINT/);
  assert.match(card,/Veri bekleniyor/);
  assert.doesNotMatch(card,/DEMO_ONLY.*[0-9]{3}/);
});
