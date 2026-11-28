/** Local synthetic full-snapshot projection, never a public read route. */
import {verifySyntheticGitHubEvidence} from './sync-github-evidence.mjs';
import {decode,verify} from './revision-proofs.mjs';
const HASH=/^[a-f0-9]{64}$/;
export const generationMessage=(generation,previousOperation,commit,manifestHash,operationId,evidenceHash)=>['TOPWHIZ_LOCAL_NEWS_GENERATION_V2',generation,previousOperation,commit,manifestHash,operationId,evidenceHash];
export async function projectLocalNews({env,expectedCommit,expectedRunId,manifest,signature,fetcher,generation,previousOperation,generationSignature}){
 const {TPW_DB:db,TPW_MODE,TPW_RELEASE_GATE,TPW_GITHUB_WRITES,TPW_SYNC_CI_PUBLIC_KEY,TPW_EDITOR_PUBLIC_KEY_SPKI_B64,TPW_SYNC_AUTHORITY_PUBLIC_KEY,TPW_SYNC_REPO_ID,TPW_SYNC_WORKFLOW_ID}=env;
 const pins={TPW_MODE,TPW_RELEASE_GATE,TPW_GITHUB_WRITES,TPW_SYNC_CI_PUBLIC_KEY,TPW_EDITOR_PUBLIC_KEY_SPKI_B64,TPW_SYNC_REPO_ID,TPW_SYNC_WORKFLOW_ID};
 if(!db||!Number.isSafeInteger(generation)||generation<1||(generation===1?previousOperation!==null:typeof previousOperation!=='string'||!HASH.test(previousOperation)))throw Error('PROJECTION_CONTEXT');
 if(TPW_SYNC_AUTHORITY_PUBLIC_KEY===TPW_SYNC_CI_PUBLIC_KEY)throw Error('PROJECTION_ROLE_SEPARATION');
 // No caller-provided receipt or file bytes can bypass the REST evidence verification.
 const verified=await verifySyntheticGitHubEvidence({env:pins,expectedCommit,expectedRunId,manifest,signature,fetcher});
 const {commit,runId,manifestHash,operationId,evidenceHash,records}=verified;
 // Do not import actual licensed or unlicensed news in this local-only implementation.
 if(records.some(r=>r.document.sources.some(s=>s.rights!=='LINK_ONLY'||!/^(?:[a-z0-9-]+\.)*example\.(?:org|net|com)$/.test(new URL(s.url).hostname))))throw Error('PROJECTION_SYNTHETIC_ONLY');
 const authority=await crypto.subtle.importKey('raw',decode(TPW_SYNC_AUTHORITY_PUBLIC_KEY,32),'Ed25519',false,['verify']);
 await verify(authority,generationMessage(generation,previousOperation,commit,manifestHash,operationId,evidenceHash),generationSignature);
 const reconcile=async()=>{
  const row=await db.prepare('SELECT generation,commit_sha,run_id,manifest_hash,previous_op,record_count,evidence_hash FROM tpw_news_projection_ops WHERE operation_id=?').bind(operationId).first();
  if(!row)return null;
  if(row.generation!==generation||row.commit_sha!==commit||row.run_id!==runId||row.manifest_hash!==manifestHash||row.previous_op!==previousOperation||row.record_count!==records.length||row.evidence_hash!==evidenceHash)throw Error('PROJECTION_RECEIPT_MISMATCH');
  return {status:'HISTORICAL_RECEIPT',generation,operationId,publication:'HARD_NO_GO'};
 };
 const prior=await reconcile();if(prior)return prior;
 // The conditional NOT NULL insert is a transaction fence, not an application-side precheck.
 const statements=[db.prepare('INSERT INTO tpw_news_projection_ops(operation_id,generation,commit_sha,run_id,manifest_hash,previous_op,record_count,evidence_hash) VALUES(CASE WHEN EXISTS(SELECT 1 FROM tpw_news_projection_head h WHERE h.singleton=1 AND h.generation=? AND h.operation_id IS ? AND (h.generation=0 OR EXISTS(SELECT 1 FROM tpw_news_projection_ops prior WHERE prior.operation_id=h.operation_id AND prior.evidence_hash IS NOT NULL))) THEN ? ELSE NULL END,?,?,?,?,?,?,?)').bind(generation-1,previousOperation,operationId,generation,commit,runId,manifestHash,previousOperation,records.length,evidenceHash)];
 for(const r of records)statements.push(db.prepare('INSERT INTO tpw_news_projection_rows(operation_id,path,sha256,document_json) VALUES(?,?,?,?)').bind(operationId,r.path,r.sha256,JSON.stringify(r.document,null,2)+'\n'));
 statements.push(db.prepare('UPDATE tpw_news_projection_head SET generation=?,operation_id=? WHERE singleton=1 AND generation=? AND operation_id IS ?').bind(generation,operationId,generation-1,previousOperation));
 try{
  const results=await db.batch(statements);
  if(results.length!==statements.length||results.some(x=>!x.success)||results.at(-1).meta?.changes!==1)throw Error('PROJECTION_BATCH_UNCERTAIN');
 }catch(error){
  const receipt=await reconcile();if(receipt)return receipt;
  throw error;
 }
 return {status:'LOCAL_APPLIED',generation,operationId,publication:'HARD_NO_GO'};
}
/** Single SQL statement: no torn snapshot between reading head and fetching rows. */
export async function readLocalNewsProjection(env){
 if(env.TPW_MODE!=='LOCAL_DRY_RUN'||env.TPW_RELEASE_GATE!=='CLOSED'||env.TPW_GITHUB_WRITES!=='DISABLED')throw Error('PROJECTION_LOCAL_ONLY');
 const result=await env.TPW_DB.prepare('SELECT h.generation,h.operation_id,r.path,r.sha256,r.document_json FROM tpw_news_projection_head h JOIN tpw_news_projection_ops o ON o.operation_id=h.operation_id AND o.evidence_hash IS NOT NULL JOIN tpw_news_projection_rows r ON r.operation_id=h.operation_id WHERE h.singleton=1 ORDER BY r.path').all();
 return result.results||[];
}
