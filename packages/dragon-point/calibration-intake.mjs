/**
 * Dragon Point calibration research workbench (not a scoring or release API).
 *
 * Accepts raw, provenance-claimed measurement batches into a structured review
 * queue. NEVER self-certifies sources, rights, reference anchors or DP scores.
 * No network access, no credentials, no mutation of the canonical methodology.
 */
import { DRAGON_METHOD, METRICS } from "./engine.mjs";

const byMetric=new Map(METRICS.map(m=>[m.id,m]));
const idOk=x=>typeof x==="string" && /^[a-z0-9][a-z0-9-]{0,99}$/i.test(x);
const isDate=s=>{
  if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+"T00:00:00Z");
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
};
const sourceHost=url=>{
  if(typeof url!=="string" || url.length>2048)return null;
  try{
    const u=new URL(url);
    if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
    const h=u.hostname.toLowerCase().replace(/\.$/,"");
    // Metadata check, NOT a network authorization or an SSRF-safe DNS resolver.
    if(!h.includes(".")||h.startsWith("[")||/^[\d.]+$/.test(h)||
      /\.(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(h))return null;
    return h;
  }catch{return null;}
};
const reject=(input,issues)=>Object.freeze({
  methodologyVersion:DRAGON_METHOD.version,
  metricId:typeof input?.metricId==="string"?input.metricId:null,
  status:"REJECTED",publishable:false,calibrated:false,
  approvedAnchors:null,reviewRequired:true,
  sampleCount:0,distinctDeviceVariants:0,
  observedRange:null,issues:Object.freeze(issues)
});

/** Full 37-item deterministic backlog. Preliminary does not mean approved. */
export function calibrationBacklog(){
  const preliminary=METRICS.filter(m=>m.calibration).map(m=>m.id);
  const uncalibrated=METRICS.filter(m=>!m.calibration).map(m=>m.id);
  return Object.freeze({
    methodologyVersion:DRAGON_METHOD.version,
    totalMetrics:METRICS.length,maximum:DRAGON_METHOD.maximum,
    preliminary:Object.freeze(preliminary),
    uncalibrated:Object.freeze(uncalibrated),
    publishable:false,methodologyStatus:DRAGON_METHOD.status
  });
}

/**
 * Candidate input schema:
 * {metricId,methodologyVersion,asOfDate,samples:[{
 *   sampleId,metric,deviceId,variantId,value,unit,
 *   evidence:{kind:"INDEPENDENT", verified:true, licenseStatus:"PERMITTED",
 *     deviceId,variantId,sourceUrl,measuredAt, benchmark?:{suite,major,mode},
 *     protocol?:string}
 * }]}
 *
 * verified/rights are only untrusted submission assertions. The operator must
 * independently verify provenance, rights, physical lab protocol and signoff.
 */
export function assessCalibrationCandidate(input){
  const metric=byMetric.get(input?.metricId);
  if(!metric || input?.methodologyVersion!==DRAGON_METHOD.version ||
    !isDate(input?.asOfDate) || !Array.isArray(input?.samples) ||
    input.samples.length===0 || input.samples.length>1000)
    return reject(input,["invalid metric, methodology version, as-of date or sample batch"]);
  const issues=[],sampleIds=new Set(),variants=new Set(),hosts=new Set(),values=[];
  let candidateProtocol=null,candidateUnit=null;
  for(const sample of input.samples){
    if(!sample||typeof sample!=="object"||!sample.evidence||typeof sample.evidence!=="object"){
      issues.push("invalid sample or evidence shape");continue;
    }
    const e=sample.evidence;
    if(!idOk(sample.sampleId)||sampleIds.has(sample.sampleId)){
      issues.push("duplicate or invalid sampleId");continue;
    }
    sampleIds.add(sample.sampleId);
    if(!idOk(sample.deviceId)||!idOk(sample.variantId)||
      e.deviceId!==sample.deviceId||e.variantId!==sample.variantId){
      issues.push("device or regional variant identity mismatch");continue;
    }
    if(sample.metric!==metric.id || typeof sample.unit!=="string" ||
      sample.unit.length===0 || sample.unit.length>40 ||
      typeof sample.value!=="number"||!Number.isFinite(sample.value)||
      sample.value<0||sample.value>1e12){
      issues.push("metric, unit or numeric measurement mismatch");continue;
    }
    if(e.kind!=="INDEPENDENT"||e.verified!==true||
      e.licenseStatus!=="PERMITTED"||!isDate(e.measuredAt)||
      e.measuredAt>input.asOfDate){
      issues.push("untrusted evidence metadata, permission or future measurement");continue;
    }
    const host=sourceHost(e.sourceUrl);
    if(!host){issues.push("unsafe or invalid source URL");continue;}
    const c=metric.calibration;
    if(c){
      if(sample.unit!==c.unit){issues.push("metric measurement unit mismatch");continue;}
      if(c.benchmark){
        if(!e.benchmark || e.benchmark.suite!==c.benchmark.suite ||
          e.benchmark.major!==c.benchmark.major||e.benchmark.mode!==c.benchmark.mode){
          issues.push("benchmark suite/version/mode mismatch");continue;
        }
      }else if(e.benchmark!==undefined){
        issues.push("unexpected benchmark for non-benchmark metric");continue;
      }
      if(c.protocol && e.protocol!==c.protocol){
        issues.push("measurement protocol mismatch");continue;
      }
    }else{
      // Protocol strings for an uncalibrated metric are collection tags only,
      // NOT approved or sufficient to calculate Dragon Point values.
      if(typeof e.protocol!=="string"||!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(e.protocol)||
        e.benchmark!==undefined){
        issues.push("uncalibrated metric requires candidate protocol and no inferred benchmark");continue;
      }
      if(candidateProtocol!==null && candidateProtocol!==e.protocol){
        issues.push("inconsistent proposed protocol across samples");continue;
      }
      if(candidateUnit!==null && candidateUnit!==sample.unit){
        issues.push("inconsistent measurement units across samples");continue;
      }
      candidateProtocol=e.protocol;
    }
    if(candidateUnit===null)candidateUnit=sample.unit;
    variants.add(sample.deviceId+"::"+sample.variantId);
    hosts.add(host);
    values.push(sample.value);
  }
  if(issues.length)return reject(input,issues);
  const enough=values.length>=3 && variants.size>=3;
  const status=!enough?"COLLECT_MORE_EVIDENCE":
    metric.calibration?"REQUIRES_REVIEW":"NEEDS_PROTOCOL_CALIBRATION";
  return Object.freeze({
    methodologyVersion:DRAGON_METHOD.version,metricId:metric.id,
    status,publishable:false,calibrated:false,reviewRequired:true,
    approvedAnchors:null,
    sampleCount:values.length,distinctDeviceVariants:variants.size,
    distinctSourceHosts:hosts.size,
    candidateProtocol:metric.calibration?null:candidateProtocol,
    observedRange:Object.freeze([Math.min(...values),Math.max(...values)]),
    issues:Object.freeze([])
  });
}
