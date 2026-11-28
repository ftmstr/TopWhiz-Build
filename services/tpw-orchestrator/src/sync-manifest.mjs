/** Offline-only read-model admission. No network, D1 writes, or release authorization. */
import {canonicalBytes,canonicalHash} from './canonical.mjs';
import {decode,verify} from './revision-proofs.mjs';
import {publicationGate,safeApprovedPath} from './policy.mjs';
import {verifyEditorialApproval} from './editorial-proof.mjs';
const SHA=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/;
const REPO='ftmstr/TopWhiz-Content-Private',BRANCH='content-approved-pilot';
const MAX_FILES=30,MAX_FILE=60_000,MAX_TOTAL=600_000;
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
export const syncManifestMessage=m=>['TOPWHIZ_OFFLINE_CI_MANIFEST_V1',m];
/** expectedCommit and expectedRunId must come from independently trusted CI context,
 * never from the manifest itself. Pinned keys are external configuration.
 * This validates supplied bytes, not actual GitHub tree membership or CI API state.
 */
export async function verifyOfflineManifest({env,expectedCommit,expectedRunId,manifest,signature,files}){
 if(env?.TPW_MODE!=='LOCAL_DRY_RUN'||env.TPW_RELEASE_GATE!=='CLOSED'||env.TPW_GITHUB_WRITES!=='DISABLED')throw Error('SYNC_LOCAL_ONLY');
 if(typeof expectedCommit!=='string'||!SHA.test(expectedCommit)||!Number.isSafeInteger(expectedRunId)||expectedRunId<=0)throw Error('SYNC_TRUST_CONTEXT');
 const ciPin=env.TPW_SYNC_CI_PUBLIC_KEY,editorPin=env.TPW_EDITOR_PUBLIC_KEY_SPKI_B64;
 // Snapshot all caller-owned inputs before the first asynchronous verification.
 const m=JSON.parse(JSON.stringify(manifest));
 if(!exact(m,['version','repository','branch','commit','runId','entries'])||m.version!==1||m.repository!==REPO||m.branch!==BRANCH||m.commit!==expectedCommit||m.runId!==expectedRunId||!Array.isArray(m.entries)||m.entries.length<1||m.entries.length>MAX_FILES)throw Error('SYNC_MANIFEST_CONTEXT');
 if(!(files instanceof Map)||files.size!==m.entries.length)throw Error('SYNC_FILE_SET');
 const captured=[];let total=0,prior='';
 for(const e of m.entries){
  if(!exact(e,['path','sha256','bytes'])||typeof e.path!=='string'||!/^content-approved\/news\/news_[a-z0-9][a-z0-9_-]{5,90}\.json$/.test(e.path)||e.path<=prior||typeof e.sha256!=='string'||!HASH.test(e.sha256)||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>MAX_FILE)throw Error('SYNC_ENTRY');
  prior=e.path;
  const b=files.get(e.path);
  if(!(b instanceof Uint8Array)||b.byteLength!==e.bytes||(total+=b.byteLength)>MAX_TOTAL)throw Error('SYNC_FILE_BYTES');
  captured.push(new Uint8Array(b));
 }
 const ciKey=await crypto.subtle.importKey('raw',decode(ciPin,32),'Ed25519',false,['verify']);
 await verify(ciKey,syncManifestMessage(m),signature);
 const records=[];
 for(let i=0;i<m.entries.length;i++){
  const e=m.entries[i],b=captured[i];
  if(await digest(b)!==e.sha256)throw Error('SYNC_FILE_DIGEST');
  const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b),doc=JSON.parse(raw);
  // Exact writer format prevents duplicate JSON keys and serialization ambiguity.
  if(raw!==JSON.stringify(doc,null,2)+'\n')throw Error('SYNC_FILE_SERIALIZATION');
  if(doc.kind!=='news'||!publicationGate(doc,{releaseGate:'OPEN'}).ok||safeApprovedPath(doc)!==e.path)throw Error('SYNC_CONTENT_POLICY');
  await verifyEditorialApproval(doc,editorPin);
  records.push({path:e.path,sha256:e.sha256,document:doc});
 }
 const manifestHash=await canonicalHash(m);
 return {status:'LOCAL_VALIDATED_NOT_PUBLISHED',commit:m.commit,runId:m.runId,manifestHash,operationId:await canonicalHash(['TOPWHIZ_OFFLINE_SYNC_V1',m.repository,m.branch,m.commit,manifestHash]),records,publication:'HARD_NO_GO'};
}
