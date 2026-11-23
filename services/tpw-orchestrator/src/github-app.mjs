/** Restricted GitHub App: no PAT; one separately verified private content repo only. */
import {publicationGate,safeApprovedPath} from './policy.mjs';
function pkcs8(pem){
 if(typeof pem!=='string'||!pem.includes('BEGIN PRIVATE KEY'))throw new Error('PKCS8_KEY_REQUIRED');
 const b64=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw new Error('BAD_KEY');
 return Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
}
const enc=x=>btoa(String.fromCharCode(...x)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export async function appJwt(appId,pem,now=Math.floor(Date.now()/1000)){
 if(!/^\d{1,15}$/.test(String(appId)))throw new Error('BAD_APP_ID');
 const key=await crypto.subtle.importKey('pkcs8',pkcs8(pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const te=new TextEncoder(),header=enc(te.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const payload=enc(te.encode(JSON.stringify({iat:now-60,exp:now+480,iss:String(appId)})));
 const message=header+'.'+payload;
 const sig=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,te.encode(message)));
 return message+'.'+enc(sig);
}
export async function issueInstallationToken(env,fetcher=fetch){
 if(env.TPW_MODE!=='PRIVATE_PILOT'||env.TPW_GITHUB_WRITES!=='ENABLED')throw new Error('WRITES_DISABLED');
 if(!/^\d+$/.test(String(env.GITHUB_INSTALLATION_ID))||!/^\d+$/.test(String(env.GITHUB_REPO_ID))||!Number.isSafeInteger(Number(env.GITHUB_REPO_ID))||Number(env.GITHUB_REPO_ID)<=0)throw new Error('BAD_GITHUB_IDS');
 const jwt=await appJwt(env.GITHUB_APP_ID,env.GITHUB_APP_PRIVATE_KEY);
 const url='https://api.github.com/app/installations/'+env.GITHUB_INSTALLATION_ID+'/access_tokens';
 const res=await fetcher(url,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+jwt,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({repository_ids:[Number(env.GITHUB_REPO_ID)],permissions:{contents:'write'}})});
 if(!res.ok)throw new Error('TOKEN_ISSUE_HTTP_'+res.status);
 const obj=await res.json();if(typeof obj.token!=='string'||obj.token.length<15)throw new Error('TOKEN_MISSING');
 return obj.token;
}
/** GitHub private metadata must match our constrained target; config flag alone is insufficient. */
export async function verifyPrivateContentRepository(env,token,fetcher=fetch){
 const res=await fetcher('https://api.github.com/repos/ftmstr/TopWhiz-Content-Private',{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
 if(!res.ok)throw new Error('GITHUB_REPO_METADATA_UNAVAILABLE');
 const r=await res.json();
 if(r?.private!==true||r?.visibility!=='private'||r?.archived!==false||r?.owner?.login!=='ftmstr'||r?.name!=='TopWhiz-Content-Private'||r?.full_name!=='ftmstr/TopWhiz-Content-Private'||r?.id!==Number(env.GITHUB_REPO_ID))throw new Error('GITHUB_TARGET_NOT_PRIVATE_VERIFIED');
 return true;
}
export async function commitApprovedContent(env,doc,fetcher=fetch){
 if(env.TPW_MODE!=='PRIVATE_PILOT'||env.TPW_GITHUB_WRITES!=='ENABLED'||env.TPW_RELEASE_GATE!=='CLOSED')throw new Error('WRITES_CLOSED');
 const valid=publicationGate(doc,{releaseGate:'OPEN'});
 if(!valid.ok)throw new Error('CONTENT_INVALID_'+valid.errors.join('_'));
 if(env.GITHUB_OWNER!=='ftmstr'||env.GITHUB_REPO!=='TopWhiz-Content-Private'||env.GITHUB_BRANCH!=='content-approved-pilot'||env.TPW_CONTENT_REPO_PRIVATE_CONFIRMED!=='YES')throw new Error('UNTRUSTED_TARGET');
 const token=await issueInstallationToken(env,fetcher);await verifyPrivateContentRepository(env,token,fetcher);const path=safeApprovedPath(doc);
 const bytes=new TextEncoder().encode(JSON.stringify(doc,null,2)+'\n');
 const url='https://api.github.com/repos/ftmstr/TopWhiz-Content-Private/contents/'+path;
 const res=await fetcher(url,{method:'PUT',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({message:'content(tpw): approved '+doc.id+' [PILOT / NO DEPLOY]',content:btoa(String.fromCharCode(...bytes)),branch:env.GITHUB_BRANCH})});
 if(res.status!==201)throw new Error('GITHUB_CREATE_FAIL_CLOSED_'+res.status);
 const result=await res.json();if(!/^[a-f0-9]{40}$/.test(result?.commit?.sha||''))throw new Error('GITHUB_CREATE_RESPONSE_UNVERIFIED');
 return {path,status:'PRIVATE_PILOT_ONLY',sha:result.commit.sha};
}