/** TPW canonical JSON v1: ASCII object keys, UTF-8 strings, safe integers, no normalization. */
export function canonicalJSON(x,depth=0){
 if(depth>32)throw Error('CANONICAL_DEPTH');
 if(x===null||typeof x==='boolean')return JSON.stringify(x);
 if(typeof x==='string'){
  for(const ch of x){const n=ch.codePointAt(0);if(n>=0xd800&&n<=0xdfff)throw Error('CANONICAL_SURROGATE')}
  return JSON.stringify(x);
 }
 if(typeof x==='number'){
  if(!Number.isSafeInteger(x)||Object.is(x,-0))throw Error('CANONICAL_NUMBER');
  return String(x);
 }
 if(Array.isArray(x)){
  if(Object.keys(x).length!==x.length||Array.from({length:x.length},(_,i)=>i).some(i=>!Object.hasOwn(x,i)))throw Error('CANONICAL_ARRAY');
  return '['+x.map(v=>canonicalJSON(v,depth+1)).join(',')+']';
 }
 if(!x||typeof x!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(x)))throw Error('CANONICAL_TYPE');
 const keys=Object.keys(x).sort();
 if(keys.some(k=>!/^[A-Za-z0-9_]+$/.test(k)))throw Error('CANONICAL_KEY');
 return '{'+keys.map(k=>JSON.stringify(k)+':'+canonicalJSON(x[k],depth+1)).join(',')+'}';
}
export const canonicalBytes=x=>new TextEncoder().encode(canonicalJSON(x));
export async function canonicalHash(x){
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',canonicalBytes(x))),v=>v.toString(16).padStart(2,'0')).join('');
}
