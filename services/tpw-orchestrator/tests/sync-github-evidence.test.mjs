import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {canonicalBytes} from '../src/canonical.mjs';
import {editorialApprovalBytes} from '../src/editorial-proof.mjs';
import {syncManifestMessage} from '../src/sync-manifest.mjs';
import {verifySyntheticGitHubEvidence} from '../src/sync-github-evidence.mjs';
const ci=generateKeyPairSync('ed25519'),editor=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const repo='ftmstr/TopWhiz-Content-Private',branch='content-approved-pilot',commit='a'.repeat(40),treeSha='b'.repeat(40),hash='c'.repeat(64),at='2026-11-23T00:00:00Z',root='https://api.github.com/repos/'+repo;
const env={TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED',TPW_SYNC_REPO_ID:111,TPW_SYNC_WORKFLOW_ID:222,TPW_SYNC_CI_PUBLIC_KEY:ci.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64url'),TPW_EDITOR_PUBLIC_KEY_SPKI_B64:editor.publicKey.export({type:'spki',format:'der'}).toString('base64')};
function fixture(){
 const d={schemaVersion:'1.0',id:'news_evidence_fixture_01',kind:'news',status:'APPROVED',title:{tr:'Kurgusal teknik haber',en:'Fictional technology news'},summary:{tr:'Yalnızca sentetik bir test örneğidir.',en:'This is a synthetic test example.'},body:{tr:'Gerçek bir haber iddiası içermeyen tamamen kurgusal örnek metindir.',en:'Entirely fictional sample text without any actual news claim.'},sources:[{url:'https://source.example.org/news',publisher:'Example A',rights:'LINK_ONLY',type:'PRIMARY',checkedAt:at,claimHash:hash},{url:'https://lab.example.net/review',publisher:'Example B',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:hash}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:hash},media:[],publishedAt:at,sourceDigest:hash};
 d.review.signature=sign('sha256',Buffer.from(editorialApprovalBytes(d)),{key:editor.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
 const b=Buffer.from(JSON.stringify(d,null,2)+'\n'),path='content-approved/news/'+d.id+'.json',sha=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
 const manifest={version:1,repository:repo,branch,commit,runId:333,entries:[{path,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length}]};
 const signature=sign(null,canonicalBytes(syncManifestMessage(manifest)),ci.privateKey).toString('base64url');
 const repository={id:111,full_name:repo,private:true,visibility:'private',archived:false};
 const run={id:333,workflow_id:222,path:'.github/workflows/content-approval.yml',head_sha:commit,head_branch:branch,repository:{id:111},head_repository:{id:111},event:'push',status:'completed',conclusion:'success',run_attempt:2};
 const jobs={total_count:2,jobs:['approved-content-validation','source-rights-validation'].map((name,i)=>({id:444+i,name,run_id:333,run_attempt:2,head_sha:commit,status:'completed',conclusion:'success'}))};
 const gitCommit={sha:commit,tree:{sha:treeSha}},tree={sha:treeSha,truncated:false,tree:[{path,sha,size:b.length,type:'blob',mode:'100644'}]},blob={sha,size:b.length,encoding:'base64',content:b.toString('base64')};
 const routes=new Map([['',repository],['/actions/runs/333',run],['/actions/runs/333/attempts/2/jobs?per_page=100',jobs],['/git/commits/'+commit,gitCommit],['/git/trees/'+treeSha+'?recursive=1',tree],['/git/blobs/'+sha,blob]]);
 const calls=[],fetcher=async(url,init)=>{assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.ok(url.startsWith(root));calls.push(url);const v=routes.get(url.slice(root.length));assert.ok(v);return new Response(JSON.stringify(v),{status:200})};
 return {input:{env,expectedCommit:commit,expectedRunId:333,manifest,signature,fetcher},repository,run,jobs,gitCommit,tree,blob,calls};
}
test('synthetic REST evidence binds exact commit tree blobs and required CI attempt to operation',async()=>{
 const f=fixture(),a=await verifySyntheticGitHubEvidence(f.input),b=await verifySyntheticGitHubEvidence(f.input);
 assert.equal(a.status,'SYNTHETIC_API_EVIDENCE_VALIDATED');assert.equal(a.treeSha,treeSha);assert.equal(a.attempt,2);assert.equal(a.evidenceHash,b.evidenceHash);assert.equal(a.operationId,b.operationId);assert.equal(a.publication,'HARD_NO_GO');assert.equal(f.calls.length,12);
});
test('synthetic REST rejects wrong repo workflow commit attempt and unsuccessful jobs',async()=>{
 for(const mutate of [f=>f.repository.private=false,f=>f.run.head_repository.id=999,f=>f.run.workflow_id=999,f=>f.run.path='other.yml',f=>f.run.head_sha='d'.repeat(40),f=>f.run.conclusion='failure',f=>f.jobs.jobs[0].run_attempt=1,f=>f.jobs.jobs[0].conclusion='skipped',f=>f.jobs.jobs[1].name=f.jobs.jobs[0].name,f=>f.jobs.total_count=3]){
  const f=fixture();mutate(f);await assert.rejects(verifySyntheticGitHubEvidence(f.input));
 }
});
test('synthetic REST rejects incomplete or conflicting Git tree and blob bytes',async()=>{
 for(const mutate of [f=>f.gitCommit.sha='d'.repeat(40),f=>f.tree.truncated=true,f=>f.tree.tree.push({...f.tree.tree[0],path:'content-approved/news/news_extra_001.json'}),f=>f.tree.tree[0].mode='120000',f=>f.tree.tree[0].type='commit',f=>f.blob.content=Buffer.alloc(f.blob.size).toString('base64'),f=>f.blob.sha='d'.repeat(40)]){
  const f=fixture();mutate(f);await assert.rejects(verifySyntheticGitHubEvidence(f.input));
 }
});
test('synthetic REST never uses real transport or accepts redirected response',async()=>{
 const f=fixture();await assert.rejects(verifySyntheticGitHubEvidence({...f.input,fetcher:globalThis.fetch}),/SYNC_EVIDENCE_LOCAL_ONLY/);
 await assert.rejects(verifySyntheticGitHubEvidence({...f.input,env:{...env,TPW_MODE:'PRIVATE_PILOT'}}),/SYNC_EVIDENCE_LOCAL_ONLY/);
 const response=new Response('{}',{status:200});Object.defineProperty(response,'url',{value:'https://evil.example.org/'});
 await assert.rejects(verifySyntheticGitHubEvidence({...f.input,fetcher:async()=>response}),/SYNC_EVIDENCE_HTTP/);assert.equal(f.calls.length,0);
});
