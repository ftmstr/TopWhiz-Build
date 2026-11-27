/** Synthetic GitHub REST evidence adapter. No live network authorization or projection writes. */
import {boundedResponseText} from './adapters.mjs';
import {canonicalHash} from './canonical.mjs';
import {verifyOfflineManifest} from './sync-manifest.mjs';
const SHA=/^[a-f0-9]{40}$/,REPO='ftmstr/TopWhiz-Content-Private',BRANCH='content-approved-pilot';
const ROOT='https://api.github.com/repos/'+REPO,NEWS='content-approved/news/';
const REQUIRED=['approved-content-validation','source-rights-validation'];
const hex=async(algorithm,bytes)=>Array.from(new Uint8Array(await crypto.subtle.digest(algorithm,bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function gitBlobSha(bytes){
 const prefix=new TextEncoder().encode('blob '+bytes.length+'\0'),joined=new Uint8Array(prefix.length+bytes.length);
 joined.set(prefix);joined.set(bytes,prefix.length);return hex('SHA-1',joined);
}
const positive=x=>Number.isSafeInteger(x)&&x>0;
export async function verifySyntheticGitHubEvidence({env,expectedCommit,expectedRunId,manifest,signature,fetcher}){
 if(env?.TPW_MODE!=='LOCAL_DRY_RUN'||env.TPW_RELEASE_GATE!=='CLOSED'||env.TPW_GITHUB_WRITES!=='DISABLED'||typeof fetcher!=='function'||fetcher===globalThis.fetch)throw Error('SYNC_EVIDENCE_LOCAL_ONLY');
 const pins={...env},repoId=pins.TPW_SYNC_REPO_ID,workflowId=pins.TPW_SYNC_WORKFLOW_ID;
 if(!positive(repoId)||!positive(workflowId)||!positive(expectedRunId)||typeof expectedCommit!=='string'||!SHA.test(expectedCommit))throw Error('SYNC_EVIDENCE_CONTEXT');
 const m=JSON.parse(JSON.stringify(manifest));
 if(m?.commit!==expectedCommit||m?.runId!==expectedRunId||m?.repository!==REPO||m?.branch!==BRANCH||!Array.isArray(m.entries)||m.entries.length<1||m.entries.length>30)throw Error('SYNC_EVIDENCE_MANIFEST');
 const get=async suffix=>{
  const url=ROOT+suffix,res=await fetcher(url,{method:'GET',redirect:'error',headers:{Accept:'application/vnd.github+json','Cache-Control':'no-store'}});
  if(res?.status!==200||res.redirected||(res.url&&res.url!==url))throw Error('SYNC_EVIDENCE_HTTP');
  return JSON.parse(await boundedResponseText(res,512000));
 };
 const repo=await get('');
 if(repo.id!==repoId||repo.full_name!==REPO||repo.private!==true||repo.visibility!=='private'||repo.archived!==false)throw Error('SYNC_EVIDENCE_REPO');
 const run=await get('/actions/runs/'+expectedRunId);
 if(run.id!==expectedRunId||run.workflow_id!==workflowId||run.path!=='.github/workflows/content-approval.yml'||run.head_sha!==expectedCommit||run.head_branch!==BRANCH||run.repository?.id!==repoId||run.head_repository?.id!==repoId||run.event!=='push'||run.status!=='completed'||run.conclusion!=='success'||!positive(run.run_attempt))throw Error('SYNC_EVIDENCE_RUN');
 const result=await get('/actions/runs/'+expectedRunId+'/attempts/'+run.run_attempt+'/jobs?per_page=100');
 if(result.total_count!==REQUIRED.length||!Array.isArray(result.jobs)||result.jobs.length!==REQUIRED.length||new Set(result.jobs.map(j=>j.id)).size!==REQUIRED.length||new Set(result.jobs.map(j=>j.name)).size!==REQUIRED.length||!result.jobs.every(j=>positive(j.id)&&REQUIRED.includes(j.name)&&j.run_id===expectedRunId&&j.run_attempt===run.run_attempt&&j.head_sha===expectedCommit&&j.status==='completed'&&j.conclusion==='success'))throw Error('SYNC_EVIDENCE_JOBS');
 const commit=await get('/git/commits/'+expectedCommit),treeSha=commit.tree?.sha;
 if(commit.sha!==expectedCommit||typeof treeSha!=='string'||!SHA.test(treeSha))throw Error('SYNC_EVIDENCE_COMMIT');
 const tree=await get('/git/trees/'+treeSha+'?recursive=1');
 if(tree.sha!==treeSha||tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>2000||tree.tree.some(x=>typeof x.path!=='string')||new Set(tree.tree.map(x=>x.path)).size!==tree.tree.length)throw Error('SYNC_EVIDENCE_TREE');
 // Full news subtree, not a caller-selected subset. Reject symlinks, submodules and nested paths.
 const rows=tree.tree.filter(x=>x.path.startsWith(NEWS)).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 if(rows.length!==m.entries.length||rows.some((x,i)=>x.path!==m.entries[i]?.path||!/^content-approved\/news\/news_[a-z0-9][a-z0-9_-]{5,90}\.json$/.test(x.path)||x.type!=='blob'||x.mode!=='100644'||typeof x.sha!=='string'||!SHA.test(x.sha)||!positive(x.size)||x.size>60000||x.size!==m.entries[i].bytes))throw Error('SYNC_EVIDENCE_FILE_SET');
 if(rows.reduce((n,x)=>n+x.size,0)>600000)throw Error('SYNC_EVIDENCE_SIZE');
 const files=new Map();
 for(const x of rows){
  const blob=await get('/git/blobs/'+x.sha);
  if(blob.sha!==x.sha||blob.size!==x.size||blob.encoding!=='base64'||typeof blob.content!=='string')throw Error('SYNC_EVIDENCE_BLOB');
  const b=Uint8Array.from(atob(blob.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
  if(b.length!==x.size||await gitBlobSha(b)!==x.sha)throw Error('SYNC_EVIDENCE_GIT_HASH');
  files.set(x.path,b);
 }
 const verified=await verifyOfflineManifest({env:pins,expectedCommit,expectedRunId,manifest:m,signature,files});
 const evidenceHash=await canonicalHash(['TPW_SYNTHETIC_GITHUB_EVIDENCE_V1',repoId,workflowId,expectedCommit,treeSha,expectedRunId,run.run_attempt,result.jobs.map(j=>[j.name,j.id]).sort((a,b)=>a[0]<b[0]?-1:1),verified.manifestHash,verified.operationId]);
 return {status:'SYNTHETIC_API_EVIDENCE_VALIDATED',commit:expectedCommit,treeSha,runId:expectedRunId,attempt:run.run_attempt,manifestHash:verified.manifestHash,operationId:verified.operationId,evidenceHash,records:verified.records,publication:'HARD_NO_GO'};
}
