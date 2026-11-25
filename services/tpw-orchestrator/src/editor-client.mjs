/** Closed pilot editor transport: synthetic local requests only; real endpoint is not authorized. */
import {assertTrustedEndpoint,boundedResponseText,approveEditorialOutput} from './adapters.mjs';
import {preflightCandidate} from './policy.mjs';
import {candidateDigest,originMatches} from './lineage.mjs';
const reservedHost=/^(?:[a-z0-9-]+\.)*example\.(?:org|net|com)$/;
const hash=/^[a-f0-9]{64}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export async function requestEditorialReview({env,candidate,previousRevision,slot,authorityEpoch,fetcher,timeoutMs=20000}){
 if(env.TPW_MODE!=='LOCAL_DRY_RUN'||env.TPW_RELEASE_GATE!=='CLOSED'||env.TPW_GITHUB_WRITES!=='DISABLED')throw Error('EDITOR_REAL_CONNECTION_BLOCKED');
 if(typeof fetcher!=='function'||fetcher===globalThis.fetch)throw Error('EDITOR_SYNTHETIC_TRANSPORT_REQUIRED');
 const url=env.TPW_EDITOR_API_URL,host=env.TPW_EDITOR_ALLOWED_HOST;
 assertTrustedEndpoint(url,url,host);
 if(!reservedHost.test(host)||new URL(url).search)throw Error('EDITOR_SYNTHETIC_ENDPOINT_REQUIRED');
 if(typeof env.TPW_EDITOR_API_TOKEN!=='string'||!env.TPW_EDITOR_API_TOKEN||env.TPW_EDITOR_API_TOKEN.length>4096||/[\r\n]/.test(env.TPW_EDITOR_API_TOKEN))throw Error('EDITOR_TOKEN_INVALID');
 if(!preflightCandidate(candidate).ok||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw Error('EDITOR_REQUEST_INVALID');
 const device=candidate.kind==='device';
 if(device&&(!(previousRevision===null||hash.test(previousRevision))||!/^\d{10}$/.test(slot)||!Number.isSafeInteger(authorityEpoch)||authorityEpoch<0))throw Error('EDITOR_REVISION_CONTEXT');
 const payload={schemaVersion:'1.0',candidate,...(device?{previousRevision,slot,authorityEpoch}:{})};
 const controller=new AbortController();let timer;
 const run=async()=>{
  const response=await fetcher(url,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+env.TPW_EDITOR_API_TOKEN},body:JSON.stringify(payload)});
  if(!response?.ok||response.status!==200||response.redirected||(response.url&&response.url!==url)||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('EDITOR_HTTP_CONTRACT');
  const parsed=JSON.parse(await boundedResponseText(response,65536));
  if(device&&(!object(parsed)||Object.keys(parsed).length!==2||!object(parsed.article)||!object(parsed.proof)))throw Error('EDITOR_ENVELOPE');
  const article=device?parsed.article:parsed;
  if(!object(article)||article.id!==candidate.id||article.kind!==candidate.kind||article.sourceDigest!==await candidateDigest(candidate)||!originMatches(candidate,article))throw Error('SOURCE_LINEAGE_MISMATCH');
  if(!approveEditorialOutput(article).ok)throw Error('EDITOR_POLICY');
  if(device&&parsed.proof.epoch!==authorityEpoch)throw Error('EDITOR_STALE_EPOCH');
  return {article,proof:device?parsed.proof:undefined};
 };
 try{
  return await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('EDITOR_TIMEOUT'));controller.abort()},timeoutMs)})]);
 }finally{clearTimeout(timer);controller.abort()}
}
