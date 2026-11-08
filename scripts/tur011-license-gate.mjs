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
const report={checked:[...licenses.values()].reduce((a,b)=>a+b,0),
 categories:licenses.size,unknownLicenses:unknown,approved:unknown.length===0};
process.stdout.write(JSON.stringify(report)+"\n");
if(!report.approved)process.exitCode=1;
