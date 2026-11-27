/** Loopback-only preview of the current synthetic D1 snapshot. No public route or release permission. */
import {canonicalHash} from './canonical.mjs';
import {publicationGate,safeApprovedPath} from './policy.mjs';
import {verifyEditorialApproval} from './editorial-proof.mjs';
import {startLocalText} from '../../../local-text/server.mjs';
const HASH=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
export async function loadLocalNewsView(env){
 if(env.TPW_MODE!=='LOCAL_DRY_RUN'||env.TPW_RELEASE_GATE!=='CLOSED'||env.TPW_GITHUB_WRITES!=='DISABLED')throw Error('VIEW_LOCAL_ONLY');
 // One statement, including receipt metadata, prevents torn reads across generations.
 const {results:rows,success}=await env.TPW_DB.prepare('SELECT h.generation,h.operation_id,o.generation AS receipt_generation,o.commit_sha,o.run_id,o.manifest_hash,o.evidence_hash,o.record_count,r.path,r.sha256,r.document_json FROM tpw_news_projection_head h LEFT JOIN tpw_news_projection_ops o ON o.operation_id=h.operation_id LEFT JOIN tpw_news_projection_rows r ON r.operation_id=h.operation_id WHERE h.singleton=1 ORDER BY r.path').all();
 const first=rows?.[0];
 if(success!==true||!first||!Number.isSafeInteger(first.generation)||first.generation<1||first.generation!==first.receipt_generation||!HASH.test(first.operation_id||'')||!HASH.test(first.manifest_hash||'')||!HASH.test(first.evidence_hash||'')||!SHA.test(first.commit_sha||'')||!Number.isSafeInteger(first.run_id)||first.run_id<1||rows.length!==first.record_count||rows.length>30)throw Error('VIEW_RECEIPT');
 const stories=[],entries=[];let prior='',total=0;
 for(const row of rows){
  if(row.generation!==first.generation||row.operation_id!==first.operation_id||typeof row.path!=='string'||row.path<=prior||typeof row.document_json!=='string'||!HASH.test(row.sha256||''))throw Error('VIEW_ROW');
  prior=row.path;
  const bytes=new TextEncoder().encode(row.document_json);
  if(bytes.length>60000||(total+=bytes.length)>600000||await digest(bytes)!==row.sha256)throw Error('VIEW_DIGEST');
  const d=JSON.parse(row.document_json);
  if(row.document_json!==JSON.stringify(d,null,2)+'\n'||d.kind!=='news'||!publicationGate(d,{releaseGate:'OPEN'}).ok||safeApprovedPath(d)!==row.path||d.sources.some(s=>s.rights!=='LINK_ONLY'||!/^(?:[a-z0-9-]+\.)*example\.(?:org|net|com)$/.test(new URL(s.url).hostname)))throw Error('VIEW_CONTENT');
  await verifyEditorialApproval(d,env.TPW_EDITOR_PUBLIC_KEY_SPKI_B64);
  entries.push({path:row.path,sha256:row.sha256,bytes:bytes.length});
  stories.push({tr:[d.title.tr,d.summary.tr,d.body.tr],en:[d.title.en,d.summary.en,d.body.en]});
 }
 const repository='ftmstr/TopWhiz-Content-Private',branch='content-approved-pilot';
 const manifestHash=await canonicalHash({version:1,repository,branch,commit:first.commit_sha,runId:first.run_id,entries});
 if(manifestHash!==first.manifest_hash||await canonicalHash(['TOPWHIZ_OFFLINE_SYNC_V1',repository,branch,first.commit_sha,manifestHash])!==first.operation_id)throw Error('VIEW_MANIFEST');
 return {status:'LOCAL_SYNTHETIC_NEWS',generation:first.generation,stories};
}
export function startLocalProjectionPreview(env,port=0){
 const pins={...env};
 if(pins.TPW_MODE!=='LOCAL_DRY_RUN'||pins.TPW_RELEASE_GATE!=='CLOSED'||pins.TPW_GITHUB_WRITES!=='DISABLED')throw Error('VIEW_LOCAL_ONLY');
 return startLocalText(port,{loadNews:()=>loadLocalNewsView(pins)});
}
