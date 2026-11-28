/** Scheduled agent tasks; real web release always HARD NO-GO. */
import {boundedJson,prefilterFeed,assertTrustedEndpoint} from './adapters.mjs';
import {readAuthorityEpoch} from './revision-authority.mjs';
import {appendReviewedRevision,deviceVariantKey,readRevisionHead} from './revision-ledger.mjs';
import {readOfficialSource} from './official-source.mjs';
import {stageCandidates,readStage,claimStage,assertStageLease,finishStage,cleanupStage} from './staging.mjs';
import {requestEditorialReview} from './editor-client.mjs';
import {commitApprovedContent} from './github-app.mjs';
export async function executeAgent({agent,env,fetcher=fetch,clock=Date.now(),nowFn=Date.now,scope}){
 if(env.TPW_MODE==='CLOSED')return {agent,state:'DISABLED_NO_GO',githubWrites:0};
 if(!['LOCAL_DRY_RUN','PRIVATE_PILOT'].includes(env.TPW_MODE)||env.TPW_RELEASE_GATE!=='CLOSED')throw new Error('INVALID_MODE');
 if(!env.TPW_DB)throw new Error('D1_NOT_CONFIGURED');
 if(!scope||typeof scope.guard!=='function'||!/^\d{10}$/.test(scope.slot))throw Error('HOURLY_SCOPE_REQUIRED');
 await scope.guard();
 await cleanupStage(env.TPW_DB,clock);
 if(agent==='TPW1'||agent==='TPW3'){
  const key=agent==='TPW1'?'TPW1_FEED_URL':'TPW3_FEED_URL';
  if(!env[key])return {agent,state:'NO_SOURCE_ADAPTER',githubWrites:0};
  const host=agent==='TPW1'?'TPW1_FEED_HOST':'TPW3_FEED_HOST';
  const configured=Boolean(env[agent+'_SOURCE_FORMAT']);
  if(!configured&&env.TPW_MODE!=='LOCAL_DRY_RUN')throw Error('OFFICIAL_SOURCE_REQUIRED');
  const p=configured?await readOfficialSource(env,agent,fetcher,clock):prefilterFeed(await boundedJson(env[key],env[key],fetcher,env[host]),agent==='TPW1'?'news':'device');
  const count=await stageCandidates(env.TPW_DB,p.approved,clock,{...scope,restage:configured});
  return {agent,state:'STAGED_METADATA',accepted:count,discarded:p.stats.rejected,githubWrites:0};
 }
 if(agent!=='TPW2')throw new Error('UNKNOWN_AGENT');
 const pending=await readStage(env.TPW_DB,clock,scope.slot);
 if(!env.TPW_EDITOR_API_URL||!env.TPW_EDITOR_API_TOKEN)return {agent,state:'EDITOR_UNCONFIGURED',pending:pending.length,githubWrites:0};
 assertTrustedEndpoint(env.TPW_EDITOR_API_URL,env.TPW_EDITOR_API_URL,env.TPW_EDITOR_ALLOWED_HOST);
 let approved=0,quarantined=0,writes=0,skipped=0;
 for(const p of pending){
  // The SELECT is only discovery; this conditional D1 UPDATE is the atomic ownership decision.
  await scope.guard();
  const owned=await claimStage(env.TPW_DB,p.id,crypto.randomUUID(),nowFn(),scope.slot);
  if(!owned){skipped++;continue}
  let decision='QUARANTINED';
  try{
   await scope.guard();
   const prior=owned.candidate.kind==='device'?await readRevisionHead(env.TPW_DB,await deviceVariantKey(owned.candidate)):null;
   const authorityEpoch=owned.candidate.kind==='device'?await readAuthorityEpoch(env.TPW_DB):null;
   const response=await requestEditorialReview({env,candidate:owned.candidate,previousRevision:prior?.revision_hash??null,slot:scope.slot,authorityEpoch,fetcher});
   const {article}=response;
   if(article.kind==='device'){
    // Devices never use the immutable news-style GitHub path. Local D1 receipt only.
    await appendReviewedRevision({env,owned,article,expectedHead:prior?.revision_hash??null,scope,proof:response.proof,nowFn});
    approved++;continue;
   }
   if(env.TPW_MODE==='PRIVATE_PILOT'&&env.TPW_GITHUB_WRITES==='ENABLED'){
    // No network write after the lease is lost or expired. GitHub 201 ACK loss still requires manual reconciliation.
    await assertStageLease(env.TPW_DB,owned.id,owned.leaseToken,nowFn());
    await commitApprovedContent(env,article,fetcher,async()=>{await scope.guard();await assertStageLease(env.TPW_DB,owned.id,owned.leaseToken,nowFn())});writes++;
   }
   decision='APPROVED';
  }catch{
   decision='QUARANTINED';
  }
  // If another actor stole/expired the lease, fail closed rather than overwrite a new decision.
  await scope.guard();
  await finishStage(env.TPW_DB,owned.id,decision,owned.leaseToken,nowFn());
  if(decision==='APPROVED')approved++;else quarantined++;
 }
 return {agent,state:'NO_PUBLICATION',approved,quarantined,skipped,githubWrites:writes};
}