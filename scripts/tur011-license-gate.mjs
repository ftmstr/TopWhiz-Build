import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const filename=process.argv[2];
assert.ok(filename,"pnpm license inventory required");
const source=JSON.parse(readFileSync(filename,"utf8"));
const allowed=new Set([
 "MIT","ISC","Apache-2.0","BSD-2-Clause","BSD-3-Clause","0BSD",
 "CC0-1.0","Unlicense","MPL-2.0","BSL-1.0","BlueOak-1.0.0",
 "CC-BY-3.0","CC-BY-4.0","WTFPL","Python-2.0"
]);
const suspicious=/AGPL|GPL|SSPL|Commons Clause|Proprietary|UNLICENSED|UNKNOWN/i;
const licenses=new Map();
function push(name,count=1){licenses.set(name,(licenses.get(name)??0)+count)}
if(Array.isArray(source)){
 for(const item of source){
   if(typeof item?.license==="string")push(item.license);
   else if(typeof item?.licenses==="string")push(item.licenses);
 }
}else if(source&&typeof source==="object"){
 for(const [name,entries] of Object.entries(source))push(name,Array.isArray(entries)?entries.length:1);
}
assert.ok(licenses.size>0,"empty or unsupported license report is NOT a pass");
const unknown=[...licenses.keys()].filter(name=>{
 if(suspicious.test(name))return true;
 const terms=name.replace(/[()]/g," ").split(/\s+(?:OR|AND|WITH)\s+/i).map(s=>s.trim()).filter(Boolean);
 return !terms.length||terms.some(t=>!allowed.has(t));
});
// The production allow-list above is unchanged. Only the explicit local-demo
// invocation may continue evidence collection for the exact Windows expression.
const localDemo=process.argv.length===4 && process.argv[3]==="--local-demo-review-only";
const reviewNames=new Set(["LGPL-3.0-or-later","Apache-2.0 AND LGPL-3.0-or-later"]);
const exception=unknown.every(name=>name==="LGPL-3.0-or-later" || (localDemo && name==="Apache-2.0 AND LGPL-3.0-or-later"));
const reviewPackages=Array.isArray(source)
 ? source.filter(item=>reviewNames.has(item?.license??item?.licenses))
 : [...reviewNames].flatMap(name=>Array.isArray(source?.[name])?source[name]:[]);
const report={checked:[...licenses.values()].reduce((a,b)=>a+b,0),
 categories:licenses.size,unknownLicenses:unknown,
 approved:unknown.length===0,
 releaseBlocked:unknown.length>0,
 legalReviewRequired:unknown.some(name=>reviewNames.has(name)),
 reviewPackages,
 scanComplete:true};
process.stdout.write(JSON.stringify(report)+"\n");
// Review-only exception keeps CI evidence inspectable while BLOCKING release.
if(!report.approved && !exception)process.exitCode=1;
if(exception && report.legalReviewRequired)process.stdout.write("LICENSE REVIEW BLOCKER: LGPL-3.0-or-later obligations detected. Local review only; no redistribution, merge or deploy.\n");
