/**
 * Dragon Point 1.0 — deterministic, evidence-checked RESEARCH / DEMO engine.
 * No remote calls, no private data, no production publishing authority.
 * DRAFT calibration anchors are NOT validated device-ranking standards.
 */
"use strict";

export const DRAGON_METHOD = Object.freeze({
  version: "1.0.1-draft",
  status: "DRAFT_CALIBRATION",
  maximum: 1000,
  categoryWeights: Object.freeze({
    performance: 250, camera: 190, display: 175, battery: 135,
    software: 90, connectivity: 60, design: 60, audio: 40
  })
});

// Each entry: category, submetric, weight, real-measurement calibration (or null).
// A null calibration deliberately blocks real scores pending comparative test protocols.
// Benchmarks have strictly fixed major versions AND modes, never mixed or inferred.
const rows = [
  ["performance", "cpu_single", 35, {unit:"points", anchors:[[1000,0],[3600,1]], benchmark:{suite:"Geekbench",major:6,mode:"single"}}],
  ["performance", "cpu_multi", 45, {unit:"points", anchors:[[3000,0],[11000,1]], benchmark:{suite:"Geekbench",major:6,mode:"multi"}}],
  ["performance", "gpu_benchmark", 55, {unit:"points", anchors:[[800,0],[6000,1]], benchmark:{suite:"3DMark",major:1,mode:"wild-life-extreme"}}],
  ["performance", "gpu_secondary", 20, null],
  ["performance", "sustained", 45, null],
  ["performance", "antutu_system", 25, {unit:"points", anchors:[[500000,0],[2500000,1]], benchmark:{suite:"AnTuTu",major:10,mode:"overall"}}],
  ["performance", "storage", 15, null],
  ["performance", "responsiveness", 10, null],
  ["camera", "photo", 70, {unit:"points", anchors:[[90,0],[180,1]], benchmark:{suite:"DXOMARK",major:6,mode:"photo"}}],
  ["camera", "video", 50, null],
  ["camera", "zoom", 25, null],
  ["camera", "selfie", 25, null],
  ["camera", "consistency", 20, null],
  ["display", "brightness", 45, {unit:"nit", anchors:[[450,0],[800,.5],[1300,1]], protocol:"sustained-fullscreen"}],
  ["display", "ppi", 20, {unit:"ppi", anchors:[[250,0],[300,.35],[400,.85],[450,1]]}],
  ["display", "refresh", 25, {unit:"Hz", anchors:[[0,0],[60,.4],[90,.7],[120,1]]}],
  ["display", "hdr", 30, null],
  ["display", "color", 25, null],
  ["display", "comfort", 30, null],
  ["battery", "endurance", 70, {unit:"hours", anchors:[[3,0],[15,1]], protocol:"web-browsing-200-nit"}],
  ["battery", "charge", 35, {unit:"minutes", anchors:[[15,1],[120,0]], protocol:"0-to-100-lab"}],
  ["battery", "efficiency", 15, null],
  ["battery", "longevity", 15, null],
  ["software", "os_support", 40, {unit:"years", anchors:[[0,0],[7,1]]}],
  ["software", "security", 25, {unit:"years", anchors:[[0,0],[7,1]]}],
  ["software", "accessibility", 15, null],
  ["software", "experience", 10, null],
  ["connectivity", "cellular", 25, null],
  ["connectivity", "wifi", 15, null],
  ["connectivity", "usb", 10, null],
  ["connectivity", "wireless", 10, null],
  ["design", "resistance", 25, null],
  ["design", "materials", 15, null],
  ["design", "ergonomics", 20, null],
  ["audio", "speakers", 20, null],
  ["audio", "microphone", 10, null],
  ["audio", "haptics", 10, null]
];
function freezeCalibration(calibration) {
  if (!calibration) return null;
  const copy = {...calibration};
  if (calibration.anchors) {
    copy.anchors = Object.freeze(calibration.anchors.map(anchor => Object.freeze([...anchor])));
  }
  if (calibration.benchmark) copy.benchmark = Object.freeze({...calibration.benchmark});
  return Object.freeze(copy);
}
export const METRICS = Object.freeze(rows.map(([category,name,weight,calibration]) =>
  Object.freeze({id:category+"."+name, category, weight, calibration:freezeCalibration(calibration)})
));
const byId = new Map(METRICS.map(m => [m.id, m]));
const finite = v => typeof v === "number" && Number.isFinite(v);
const round = (n, places=6) => Math.round((n + Number.EPSILON) * 10 ** places) / 10 ** places;
const reject = (deviceId, variantId, issues) => ({
  deviceId, variantId, methodologyVersion:DRAGON_METHOD.version, methodologyStatus:DRAGON_METHOD.status,
  status:"REJECTED", publishable:false, totalScore:null, coverage:0, scoreRange:null,
  categoryScores:{}, issues
});
function isTrustedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password || (u.port && u.port !== "443")) return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    // This is a *metadata hygiene check*, not a network fetch / DNS pin.
    // Reject all literal IP hosts (public or private), short intranet names and special domains.
    if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
    if (/\.(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(host)) return false;
    return true;
  } catch { return false; }
}
function isCalendarDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s+"T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === s;
}
function normalizedByAnchors(value, anchors) {
  if (value <= anchors[0][0]) return anchors[0][1];
  if (value >= anchors[anchors.length-1][0]) return anchors[anchors.length-1][1];
  for (let i=1;i<anchors.length;i++) {
    const [x,y] = anchors[i], [px,py] = anchors[i-1];
    if (value <= x) return py + ((value-px)/(x-px))*(y-py);
  }
  throw Error("unreachable anchor interval");
}
function readObservation(o, metric, context) {
  if (!o || typeof o !== "object" || !o.evidence || typeof o.evidence !== "object")
    throw Error("invalid evidence shape for "+metric.id);
  const e = o.evidence;
  if (e.kind === "SYNTHETIC") {
    if (!finite(o.normalized) || o.normalized < 0 || o.normalized > 1 ||
        Object.hasOwn(o,"value") || Object.hasOwn(o,"unit") || Object.hasOwn(o,"sourceUrl"))
      throw Error("invalid SYNTHETIC normalized value for "+metric.id);
    return {ratio:o.normalized,synthetic:true};
  }
  if (!["INDEPENDENT","MANUFACTURER"].includes(e.kind) || e.verified !== true ||
      e.licenseStatus !== "PERMITTED" || !isTrustedUrl(e.sourceUrl) || !isCalendarDate(e.measuredAt))
    throw Error("unverified, unlicensed or invalid source for "+metric.id);
  if (!isCalendarDate(context.asOfDate)) throw Error("valid as-of date required for real evidence");
  if (e.measuredAt > context.asOfDate) throw Error("future measurement is invalid for "+metric.id);
  if (e.deviceId !== context.deviceId || e.variantId !== context.variantId)
    throw Error("device or regional variant identity mismatch for "+metric.id);
  if (Object.hasOwn(o,"normalized") || !finite(o.value) || o.value < 0)
    throw Error("invalid raw measurement for "+metric.id);
  const c = metric.calibration;
  if (!c) throw Error("missing approved normalization protocol for "+metric.id);
  if (o.unit !== c.unit) throw Error("unit mismatch for "+metric.id);
  if (c.benchmark) {
    const b = e.benchmark;
    if (!b || b.suite !== c.benchmark.suite || b.major !== c.benchmark.major ||
      b.mode !== c.benchmark.mode)
      throw Error("benchmark version/mode mismatch for "+metric.id);
  } else if (Object.hasOwn(e,"benchmark")) {
    throw Error("unexpected benchmark evidence for "+metric.id);
  }
  if (c.protocol && e.protocol !== c.protocol)
    throw Error("measurement protocol mismatch for "+metric.id);
  return {ratio:Math.max(0,Math.min(1,normalizedByAnchors(o.value,c.anchors))),synthetic:false};
}
/**
 * Input has deviceId, variantId, observations[]; every observation contains
 * metric + measured raw value and verified evidence, OR synthetic demo fraction.
 * Throws no exceptions on malformed input; returns REJECTED and reason.
 * Numeric total is only exposed on complete coverage. All outputs are NO-GO
 * for production while the methodology is DRAFT_CALIBRATION.
 */
export function evaluateDragonPoint(input) {
  const deviceId = input?.deviceId, variantId = input?.variantId;
  const asOfDate = input?.asOfDate;
  const idOk = x => typeof x === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/i.test(x);
  if (!idOk(deviceId) || !idOk(variantId) || !Array.isArray(input?.observations) ||
      input.observations.length > METRICS.length)
    return reject(deviceId,variantId,["invalid identity or observations"]);
  if (asOfDate !== undefined && !isCalendarDate(asOfDate))
    return reject(deviceId,variantId,["invalid as-of date"]);
  const observed = new Map(), issues = [];
  let seenSynthetic=false, seenReal=false;
  for (const observation of input.observations) {
    const metric = byId.get(observation?.metric);
    if (!metric) { issues.push("unknown metric"); continue; }
    if (observed.has(metric.id)) { issues.push("duplicate metric "+metric.id); continue; }
    try {
      const value = readObservation(observation, metric, {deviceId,variantId,asOfDate});
      observed.set(metric.id,value);
      if (value.synthetic) seenSynthetic=true; else seenReal=true;
    } catch (error) { issues.push(String(error.message)); }
  }
  if (seenSynthetic && seenReal) issues.push("mixed synthetic and real evidence prohibited");
  if (issues.length) return reject(deviceId,variantId,issues);
  const categoryScores = {};
  let knownWeight=0, knownPoints=0;
  for (const [category,maxPoints] of Object.entries(DRAGON_METHOD.categoryWeights)) {
    const categoryMetrics=METRICS.filter(m=>m.category===category);
    let coverageWeight=0, points=0;
    for (const metric of categoryMetrics) {
      const actual=observed.get(metric.id);
      if (!actual) continue;
      coverageWeight+=metric.weight;
      points+=metric.weight*actual.ratio;
    }
    knownWeight+=coverageWeight;
    knownPoints+=points;
    categoryScores[category] = {
      points: coverageWeight===maxPoints ? round(points,4) : null,
      knownPoints: round(points,4),
      maxPoints,
      coverage:coverageWeight/maxPoints,
      missingMetrics:categoryMetrics.filter(m=>!observed.has(m.id)).map(m=>m.id)
    };
  }
  const coverage=knownWeight/DRAGON_METHOD.maximum;
  const exact = knownWeight===DRAGON_METHOD.maximum;
  const score = exact ? Math.round(knownPoints) : null;
  const status = seenSynthetic ? "DEMO_ONLY" :
    exact ? "RESEARCH_ONLY" : coverage>=0.5 ? "PROVISIONAL" : "INSUFFICIENT_DATA";
  return {
    deviceId,variantId,asOfDate:asOfDate ?? null,methodologyVersion:DRAGON_METHOD.version,
    methodologyStatus:DRAGON_METHOD.status,status,publishable:false,
    totalScore:score,coverage,
    scoreRange:exact ? [score,score] : [Math.floor(knownPoints),Math.ceil(knownPoints+DRAGON_METHOD.maximum-knownWeight)],
    categoryScores,issues:[]
  };
}
/** Explicitly fictional demonstration data. Never use as benchmark evidence. */
export function syntheticFixture(categoryFractions) {
  return METRICS.map(metric=>({
    metric:metric.id,
    normalized:typeof categoryFractions==="number" ? categoryFractions : categoryFractions?.[metric.category],
    evidence:{kind:"SYNTHETIC"}
  }));
}
