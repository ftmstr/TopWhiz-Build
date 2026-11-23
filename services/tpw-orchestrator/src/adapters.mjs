/** Bounded HTTPS source JSON adapter, no full third-party article ingestion. */
import {preflightCandidate,publicationGate} from './policy.mjs';
const LIMIT=256*1024;
export async function boundedResponseText(r,max){
 if(!r.body)throw new Error('EMPTY_RESPONSE');
 const size=Number(r.headers.get('content-length')||0);
 if(!Number.isFinite(size)||size>max)throw new Error('MAX_BYTES');
 const reader=r.body.getReader(),chunks=[];let n=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>max)throw new Error('MAX_BYTES');chunks.push(value)}}finally{reader.releaseLock()}
 const result=new Uint8Array(n);let i=0;for(const c of chunks){result.set(c,i);i+=c.byteLength}
 return new TextDecoder('utf-8',{fatal:true}).decode(result);
}
export async function boundedJson(url,allowUrl,fetcher=fetch){
 if(!url||url!==allowUrl||!url.startsWith('https://'))throw new Error('FEED_NOT_ALLOWLISTED');
 const response=await fetcher(url,{method:'GET',redirect:'error',headers:{Accept:'application/json'}});
 if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new Error('BAD_FEED_HTTP');
 try{return JSON.parse(await boundedResponseText(response,LIMIT))}catch{throw new Error('INVALID_OR_OVERSIZED_JSON')}
}
export function prefilterFeed(feed,kind){
 if(!feed||!Array.isArray(feed.items)||feed.items.length>30)throw new Error('INVALID_FEED');
 const ids=new Set(),approved=[],stats={received:feed.items.length,rejected:0,duplicates:0};
 for(const x of feed.items){
  if(x.kind!==kind||!preflightCandidate(x).ok){stats.rejected++;continue}
  if(ids.has(x.id)){stats.duplicates++;continue}
  ids.add(x.id);approved.push(x);
 }
 return {approved,stats};
}
export const approveEditorialOutput=x=>publicationGate(x,{releaseGate:'OPEN'});