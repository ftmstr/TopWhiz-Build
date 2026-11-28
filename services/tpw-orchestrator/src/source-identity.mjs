import {assertTrustedEndpoint} from './adapters.mjs';
import {publicationGate} from './policy.mjs';
export function resolveReviewedAlias(url,host,aliases=[]){
 assertTrustedEndpoint(url,url,host);
 if(!Array.isArray(aliases)||aliases.length>100)throw Error('ALIAS_CONFIG');
 const map=new Map();
 for(const row of aliases){
  if(!row||Object.keys(row).length!==2||typeof row.alias!=='string'||typeof row.canonical!=='string')throw Error('ALIAS_CONFIG');
  assertTrustedEndpoint(row.alias,row.alias,host);assertTrustedEndpoint(row.canonical,row.canonical,host);
  if(row.alias===row.canonical||map.has(row.alias))throw Error('ALIAS_CONFLICT');
  map.set(row.alias,row.canonical);
 }
 for(const value of map.values())if(map.has(value))throw Error('ALIAS_CHAIN');
 return map.get(url)??url;
}
async function digest(x){
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x)))),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function variantRevision(doc){
 if(doc?.kind!=='device'||!publicationGate(doc,{releaseGate:'OPEN'}).ok)throw Error('REVISION_INVALID_DEVICE');
 const d=doc.device;
 const variantKey=await digest([d.brand,d.sku,d.region]);
 const keys=Object.keys(d.specifications).sort();
 const dataHash=await digest([d.model,keys.map(k=>[k,d.specifications[k].value,d.specifications[k].unit])]);
 const evidenceHash=await digest([keys.map(k=>[k,d.specifications[k].sourceHash]),doc.sources.map(s=>JSON.stringify([s.url,s.publisher,s.rights,s.type,s.claimHash])).sort()]);
 return {variantKey,dataHash,evidenceHash};
}
export async function compareVariantRevision(previous,next){
 const a=await variantRevision(previous),b=await variantRevision(next);
 if(a.variantKey!==b.variantKey)throw Error('REVISION_VARIANT_MISMATCH');
 return {state:a.dataHash!==b.dataHash?'DATA_CHANGE_REVIEW_REQUIRED':a.evidenceHash!==b.evidenceHash?'EVIDENCE_CHANGE_REVIEW_REQUIRED':'UNCHANGED',previous:a,next:b};
}
