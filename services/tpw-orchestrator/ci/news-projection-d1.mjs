/** Called by existing genuine local workerd D1 CI only. No remote GitHub or Cloudflare. */
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {canonicalBytes} from '../src/canonical.mjs';
import {editorialApprovalBytes} from '../src/editorial-proof.mjs';
import {syncManifestMessage,verifyOfflineManifest} from '../src/sync-manifest.mjs';
import {generationMessage,projectLocalNews,readLocalNewsProjection} from '../src/news-projection.mjs';
export async function testNewsProjection(db,makeDoc,news){
 const ci=generateKeyPairSync('ed25519'),authority=generateKeyPairSync('ed25519'),editor=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const pin=k=>k.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64url');
 const env={TPW_DB:db,TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED',TPW_SYNC_CI_PUBLIC_KEY:pin(ci),TPW_SYNC_AUTHORITY_PUBLIC_KEY:pin(authority),TPW_EDITOR_PUBLIC_KEY_SPKI_B64:editor.publicKey.export({type:'spki',format:'der'}).toString('base64')};
 const signed=async(generation,previousOperation,hex,runId)=>{
  const files=new Map();
  for(const suffix of ['a','b']){
   const doc=await makeDoc({...news,id:'news_projection_'+hex+'_'+suffix});
   doc.review.signature=sign('sha256',Buffer.from(editorialApprovalBytes(doc)),{key:editor.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
   files.set('content-approved/news/'+doc.id+'.json',Buffer.from(JSON.stringify(doc,null,2)+'\n'));
  }
  const commit=hex.repeat(40),manifest={version:1,repository:'ftmstr/TopWhiz-Content-Private',branch:'content-approved-pilot',commit,runId,entries:[...files].map(([path,b])=>({path,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length}))};
  const signature=sign(null,canonicalBytes(syncManifestMessage(manifest)),ci.privateKey).toString('base64url');
  const f={env,expectedCommit:commit,expectedRunId:runId,manifest,signature,files};
  const verified=await verifyOfflineManifest(f);
  const generationSignature=sign(null,canonicalBytes(generationMessage(generation,previousOperation,commit,verified.manifestHash,verified.operationId)),authority.privateKey).toString('base64url');
  return {...f,generation,previousOperation,generationSignature};
 };
 const count=async table=>(await db.prepare('SELECT count(*) AS n FROM '+table).first()).n;
 const a=await signed(1,null,'a',101);
 assert.equal((await readLocalNewsProjection(env)).length,0);
 await assert.rejects(projectLocalNews({...a,env:{...env,TPW_SYNC_AUTHORITY_PUBLIC_KEY:pin(ci)}}),/PROJECTION_ROLE_SEPARATION/);
 await assert.rejects(projectLocalNews({...a,generationSignature:Buffer.alloc(64).toString('base64url')}));
 const first=await projectLocalNews(a);assert.equal(first.status,'LOCAL_APPLIED');
 assert.equal((await projectLocalNews(a)).status,'HISTORICAL_RECEIPT');
 assert.equal(await count('tpw_news_projection_ops'),1);
 const b=await signed(2,first.operationId,'b',102);
 const c=await signed(2,first.operationId,'c',103);
 const raced=await Promise.allSettled([projectLocalNews(b),projectLocalNews(c)]);
 assert.equal(raced.filter(x=>x.status==='fulfilled').length,1);
 const winner=raced.find(x=>x.status==='fulfilled').value;
 assert.equal(winner.generation,2);
 const snapshot=await readLocalNewsProjection(env);
 assert.equal(snapshot.length,2);assert.ok(snapshot.every(r=>r.generation===2&&r.operation_id===winner.operationId));
 assert.equal(await count('tpw_news_projection_rows'),4);
 const next=await signed(3,winner.operationId,'d',104);
 const rollback={prepare:db.prepare.bind(db),batch:stmts=>db.batch([...stmts.slice(0,2),db.prepare('INSERT INTO tpw_news_projection_rows(operation_id,path,sha256,document_json) VALUES(NULL,NULL,NULL,NULL)'),...stmts.slice(2)])};
 await assert.rejects(projectLocalNews({...next,env:{...env,TPW_DB:rollback}}));
 assert.equal(await count('tpw_news_projection_ops'),2);assert.equal(await count('tpw_news_projection_rows'),4);
 assert.deepEqual(await readLocalNewsProjection(env),snapshot);
 let commits=0;
 const lostAck={prepare:db.prepare.bind(db),batch:async stmts=>{await db.batch(stmts);commits++;throw Error('SYNTHETIC_ACK_LOST')}};
 const recovered=await projectLocalNews({...next,env:{...env,TPW_DB:lostAck}});
 assert.equal(recovered.status,'HISTORICAL_RECEIPT');assert.equal(commits,1);
 assert.equal((await projectLocalNews(next)).status,'HISTORICAL_RECEIPT');
 assert.equal((await projectLocalNews(a)).status,'HISTORICAL_RECEIPT');
 const stale=await signed(2,first.operationId,'e',105);await assert.rejects(projectLocalNews(stale));
 const reusedCommit=await signed(4,recovered.operationId,'a',106);await assert.rejects(projectLocalNews(reusedCommit));
 assert.equal(await count('tpw_news_projection_ops'),3);assert.equal(await count('tpw_news_projection_rows'),6);
 const final=await readLocalNewsProjection(env);assert.equal(final.length,2);assert.ok(final.every(r=>r.generation===3&&r.operation_id===recovered.operationId));
 console.log('PASS local D1 signed generation CAS, concurrent snapshot winner, atomic rollback, lost ACK receipt, historical replay and commit reuse denial');
}
