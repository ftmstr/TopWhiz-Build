import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {canonicalBytes} from '../src/canonical.mjs';
import {editorialApprovalBytes} from '../src/editorial-proof.mjs';
import {syncManifestMessage,verifyOfflineManifest} from '../src/sync-manifest.mjs';
const at='2026-11-23T00:00:00Z',hash='a'.repeat(64),commit='b'.repeat(40);
const keys=generateKeyPairSync('ed25519'),editor=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const env={TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED',TPW_SYNC_CI_PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64url'),TPW_EDITOR_PUBLIC_KEY_SPKI_B64:editor.publicKey.export({type:'spki',format:'der'}).toString('base64')};
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifestSig=m=>sign(null,canonicalBytes(syncManifestMessage(m)),keys.privateKey).toString('base64url');
function doc(id){
 const d={schemaVersion:'1.0',id,kind:'news',status:'APPROVED',title:{tr:'Kurgusal haber başlığı',en:'Fictional news headline'},summary:{tr:'Yalnızca sentetik bir örnek metindir.',en:'This is only a synthetic example.'},body:{tr:'Gerçek haber iddiası içermeyen tamamen kurgusal bir kabul testi metnidir.',en:'Entirely fictional acceptance test text with no actual news claim.'},sources:[{url:'https://source.example.org/news',publisher:'Example A',rights:'LINK_ONLY',type:'PRIMARY',checkedAt:at,claimHash:hash},{url:'https://lab.example.net/review',publisher:'Example B',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:hash}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:hash},media:[],publishedAt:at,sourceDigest:hash};
 d.review.signature=sign('sha256',Buffer.from(editorialApprovalBytes(d)),{key:editor.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');return d;
}
const bytes=d=>Buffer.from(JSON.stringify(d,null,2)+'\n');
function fixture(){
 const files=new Map(['news_sync_fixture_a','news_sync_fixture_b'].map(id=>['content-approved/news/'+id+'.json',bytes(doc(id))]));
 const manifest={version:1,repository:'ftmstr/TopWhiz-Content-Private',branch:'content-approved-pilot',commit,runId:123,entries:[...files].map(([path,b])=>({path,sha256:sha(b),bytes:b.length}))};
 return {env,expectedCommit:commit,expectedRunId:123,manifest,signature:manifestSig(manifest),files};
}
const resign=f=>{f.signature=manifestSig(f.manifest);return f};
function replace(f,i,b){const e=f.manifest.entries[i];f.files.set(e.path,b);e.sha256=sha(b);e.bytes=b.length;return resign(f)}
test('offline exact commit manifest verifies both signatures and stable operation identity',async()=>{
 const f=fixture(),a=await verifyOfflineManifest(f),b=await verifyOfflineManifest(f);
 assert.equal(a.records.length,2);assert.equal(a.operationId,b.operationId);assert.equal(a.commit,commit);assert.equal(a.publication,'HARD_NO_GO');
});
test('wrong commit, CI run, repository, branch, mode or signer denied',async()=>{
 for(const mutate of [f=>f.expectedCommit='c'.repeat(40),f=>f.expectedRunId=124,f=>{f.manifest.repository='ftmstr/TopWhiz-Build';resign(f)},f=>{f.manifest.branch='main';resign(f)},f=>f.env={...env,TPW_MODE:'PRIVATE_PILOT'},f=>f.env={...env,TPW_RELEASE_GATE:'OPEN'},f=>f.signature=Buffer.alloc(64).toString('base64url')]){
  const f=fixture();mutate(f);await assert.rejects(verifyOfflineManifest(f));
 }
});
test('manifest rejects extra, missing, duplicate and altered files even when manifest is signed',async()=>{
 for(const mutate of [f=>f.files.set('extra',Buffer.from('x')),f=>f.files.delete(f.manifest.entries[0].path),f=>{f.manifest.entries[1]=f.manifest.entries[0];resign(f)},f=>{const p=f.manifest.entries[0].path;f.files.get(p)[0]=0},f=>{f.manifest.entries.reverse();resign(f)}]){
  const f=fixture();mutate(f);await assert.rejects(verifyOfflineManifest(f));
 }
});
test('CI signature cannot substitute for editorial signature, path or approved status',async()=>{
 for(const mutate of [d=>d.title.en='Unsigned altered headline',d=>d.id='news_wrong_path_001',d=>d.status='REJECTED',d=>d.media=[{url:'https://example.org/image'}]]){
  const f=fixture(),d=JSON.parse(f.files.get(f.manifest.entries[0].path));mutate(d);replace(f,0,bytes(d));await assert.rejects(verifyOfflineManifest(f));
 }
 const f=fixture(),p=f.manifest.entries[0].path;replace(f,0,Buffer.from(f.files.get(p).toString().replace('{','{"status":"REJECTED",')));await assert.rejects(verifyOfflineManifest(f),/SYNC_FILE_SERIALIZATION/);
});
test('offline verifier snapshots bytes before async signature verification',async()=>{
 const f=fixture(),p=f.manifest.entries[0].path;const pending=verifyOfflineManifest(f);f.files.get(p).fill(0);f.manifest.commit='c'.repeat(40);const result=await pending;assert.equal(result.commit,commit);assert.equal(result.records[0].document.status,'APPROVED');
});
