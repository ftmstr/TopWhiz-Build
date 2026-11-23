/** Scheduled agent tasks; real web release always HARD NO-GO. */
import {boundedJson,boundedResponseText,prefilterFeed,approveEditorialOutput} from './adapters.mjs';
import {stageCandidates,readStage,finishStage,cleanupStage} from './staging.mjs';
import {candidateDigest,originMatches} from './lineage.mjs';
import {commitApprovedContent} from './github-app.mjs';
export async function executeAgent({agent,env,fetcher=fetch,clock=Date.now()}){
 if(env.TPW_MODE==='CLOSED')return {agent,state:'DISABLED_NO_GO',githubWrites:0};
 if(!['LOCAL_DRY_RUN','PRIVATE_PILOT'].includes(env.TPW_MODE)||env.TPW_RELEASE_GATE!=='CLOSED')throw new Error('INVALID_MODE');
 if(!env.TPW_DB)throw new Error('D1_NOT_CONFIGURED');
 await cleanupStage(env.TPW_DB,clock);
 if(agent==='TPW1'||agent==='TPW3'){
  const key=agent==='TPW1'?'TPW1_FEED_URL':'TPW3_FEED_URL';
  if(!env[key])return {agent,state:'NO_SOURCE_ADAPTER',githubWrites:0};
  const p=prefilterFeed(await boundedJson(env[key],env[key],fetcher),agent==='TPW1'?'news':'device');
  const count=await stageCandidates(env.TPW_DB,p.approved,clock);
  return {agent,state:'STAGED_METADATA',accepted:count,discarded:p.stats.rejected,githubWrites:0};
 }
 if(agent!=='TPW2')throw new Error('UNKNOWN_AGENT');
 const pending=await readStage(env.TPW_DB,clock);
 if(!env.TPW_EDITOR_API_URL||!env.TPW_EDITOR_API_TOKEN)return {agent,state:'EDITOR_UNCONFIGURED',pending:pending.length,githubWrites:0};
 if(!env.TPW_EDITOR_API_URL.startsWith('https://'))throw new Error('EDITOR_HTTPS_REQUIRED');
 let approved=0,quarantined=0,writes=0;
 for(const p of pending){
  try{
   const r=await fetcher(env.TPW_EDITOR_API_URL,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.TPW_EDITOR_API_TOKEN},body:JSON.stringify({schemaVersion:'1.0',candidate:p.candidate})});
   if(!r.ok)throw new Error('EDITOR_HTTP');
   const article=JSON.parse(await boundedResponseText(r,65536));
   if(article.id!==p.id||article.kind!==p.candidate.kind||article.sourceDigest!==await candidateDigest(p.candidate)||!originMatches(p.candidate,article))throw new Error('SOURCE_LINEAGE_MISMATCH');
   if(!approveEditorialOutput(article).ok)throw new Error('EDITOR_POLICY');
   if(env.TPW_MODE==='PRIVATE_PILOT'&&env.TPW_GITHUB_WRITES==='ENABLED'){await commitApprovedContent(env,article,fetcher);writes++}
   await finishStage(env.TPW_DB,p.id,'APPROVED');approved++;
  }catch{await finishStage(env.TPW_DB,p.id,'QUARANTINED');quarantined++}
 }
 return {agent,state:'NO_PUBLICATION',approved,quarantined,githubWrites:writes};
}