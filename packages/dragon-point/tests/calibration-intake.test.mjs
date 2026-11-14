import test from "node:test";
import assert from "node:assert/strict";
import { calibrationBacklog, assessCalibrationCandidate } from "../calibration-intake.mjs";

const make=(index, overrides={})=>{
  const deviceId="calibration-device-"+index;
  const evidence={
    kind:"INDEPENDENT",verified:true,licenseStatus:"PERMITTED",
    deviceId,variantId:"global",sourceUrl:"https://lab"+index+".example.org/cpu",
    measuredAt:"2026-11-13",
    benchmark:{suite:"Geekbench",major:6,mode:"single"}
  };
  return {sampleId:"sample-"+index,metric:"performance.cpu_single",deviceId,
    variantId:"global",value:1000+index*300,unit:"points",
    evidence:{...evidence,...overrides}};
};
const fixture=()=>({metricId:"performance.cpu_single",methodologyVersion:"1.0.1-draft",
  asOfDate:"2026-11-14",samples:[make(1),make(2),make(3)]});

test("every DP metric appears once in deterministic calibration backlog",()=>{
  const a=calibrationBacklog(), b=calibrationBacklog();
  assert.deepEqual(a,b);
  assert.equal(a.totalMetrics,37);
  assert.equal(a.preliminary.length,12);
  assert.equal(a.uncalibrated.length,25);
  assert.equal(new Set([...a.preliminary,...a.uncalibrated]).size,37);
  assert.equal(a.methodologyVersion,"1.0.1-draft");
  assert.equal(a.publishable,false);
});

test("three distinct phone variants produce observational range, never approved anchors or public scores",()=>{
  const input=fixture();
  const original=structuredClone(input);
  const result=assessCalibrationCandidate(input);
  assert.equal(result.status,"REQUIRES_REVIEW");
  assert.equal(result.sampleCount,3);
  assert.equal(result.distinctDeviceVariants,3);
  assert.deepEqual(result.observedRange,[1300,1900]);
  assert.equal(result.publishable,false);
  assert.equal(result.calibrated,false);
  assert.equal(result.approvedAnchors,null);
  assert.equal(result.issues.length,0);
  assert.deepEqual(input,original);
});

test("caller approval and submitted anchors can never activate real-device scoring",()=>{
  const result=assessCalibrationCandidate({...fixture(), approved:true,publishable:true,
    methodologicalApproval:"GO",calibration:{anchors:[[0,0],[1000,1]]}});
  assert.equal(result.status,"REQUIRES_REVIEW");
  assert.equal(result.approvedAnchors,null);
  assert.equal(result.publishable,false);
});

test("candidate with fewer than three independent variants remains in data collection",()=>{
  const one=fixture();
  one.samples=one.samples.slice(0,2);
  const result=assessCalibrationCandidate(one);
  assert.equal(result.status,"COLLECT_MORE_EVIDENCE");
  assert.equal(result.sampleCount,2);
  assert.equal(result.publishable,false);
});

test("duplicate sample IDs or duplicate device identity are rejected",()=>{
  const duplicated=fixture();duplicated.samples[1].sampleId=duplicated.samples[0].sampleId;
  const first=assessCalibrationCandidate(duplicated);
  assert.equal(first.status,"REJECTED");
  assert.match(first.issues.join(" "),/duplicate/i);
  const duplicatedDevice=fixture();duplicatedDevice.samples[1].deviceId=duplicatedDevice.samples[0].deviceId;
  duplicatedDevice.samples[1].evidence.deviceId=duplicatedDevice.samples[0].deviceId;
  const second=assessCalibrationCandidate(duplicatedDevice);
  assert.equal(second.status,"COLLECT_MORE_EVIDENCE");
  assert.equal(second.distinctDeviceVariants,2);
});

test("benchmark version, test mode and metric identity mismatch are rejected",()=>{
  for(const change of [
    sample=>{sample.evidence.benchmark.major=5;},
    sample=>{sample.evidence.benchmark.mode="multi";},
    sample=>{sample.metric="performance.cpu_multi";},
    sample=>{sample.evidence.variantId="wrong-region";}
  ]){
    const set=fixture();change(set.samples[0]);
    const result=assessCalibrationCandidate(set);
    assert.equal(result.status,"REJECTED");
  }
});

test("future measurements, invalid snapshot dates and fake raw numbers are rejected",()=>{
  const sample=fixture();sample.samples[0].evidence.measuredAt="2026-11-15";
  assert.equal(assessCalibrationCandidate(sample).status,"REJECTED");
  const invalid=fixture();invalid.asOfDate="2026-02-30";
  assert.equal(assessCalibrationCandidate(invalid).status,"REJECTED");
  const nan=fixture();nan.samples[0].value=Infinity;
  assert.equal(assessCalibrationCandidate(nan).status,"REJECTED");
});

test("unlicensed sources, unsafe hostnames and suspicious URLs are rejected",()=>{
  for(const sourceUrl of [
    "http://example.org","https://localhost/results",
    "https://127.0.0.1/results","https://[::1]/data",
    "https://user:password@example.org/data","javascript:alert(1)"
  ]){
    const set=fixture();set.samples[0].evidence.sourceUrl=sourceUrl;
    assert.equal(assessCalibrationCandidate(set).status,"REJECTED",sourceUrl);
  }
  const noRights=fixture();noRights.samples[0].evidence.licenseStatus="UNKNOWN";
  assert.equal(assessCalibrationCandidate(noRights).status,"REJECTED");
});

test("uncalibrated submetric can be collected with candidate protocol but never certified",()=>{
  const set=fixture();set.metricId="camera.video";
  set.samples=set.samples.map((s,i)=>({...s,
    metric:"camera.video",value:10+i,unit:"points",
    evidence:{...s.evidence,benchmark:undefined,protocol:"candidate-camera-video-v1"}
  }));
  const r=assessCalibrationCandidate(set);
  assert.equal(r.status,"NEEDS_PROTOCOL_CALIBRATION");
  assert.equal(r.calibrated,false);
  assert.equal(r.approvedAnchors,null);
  assert.equal(r.publishable,false);
});

test("unknown metric, incompatible method version, missing protocol and oversized batches are rejected",()=>{
  const invalid=fixture();invalid.metricId="invalid.metric";
  assert.equal(assessCalibrationCandidate(invalid).status,"REJECTED");
  const old=fixture();old.methodologyVersion="1.0.0-draft";
  assert.equal(assessCalibrationCandidate(old).status,"REJECTED");
  const missing=fixture();missing.samples[0].evidence.benchmark=undefined;
  assert.equal(assessCalibrationCandidate(missing).status,"REJECTED");
  const large=fixture();large.samples=Array(1001).fill(make(1));
  assert.equal(assessCalibrationCandidate(large).status,"REJECTED");
});
