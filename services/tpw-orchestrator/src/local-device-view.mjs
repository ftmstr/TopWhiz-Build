/** Local synthetic catalogue. Recheck the signed immutable revision before exposing display fields. */
import {candidateDigest} from './lineage.mjs';
import {variantRevision} from './source-identity.mjs';
import {publicationGate} from './policy.mjs';
import {verifyRevisionProofs} from './revision-proofs.mjs';
import {startLocalText} from '../../../local-text/server.mjs';
const HASH=/^[a-f0-9]{64}$/,FIELDS=['screen','chip','ram','storage','battery','weight','network'];
export async function loadLocalDeviceView(env,nowFn=Date.now){
 if(env.TPW_MODE!=='LOCAL_DRY_RUN'||env.TPW_RELEASE_GATE!=='CLOSED'||env.TPW_GITHUB_WRITES!=='DISABLED')throw Error('DEVICE_VIEW_LOCAL_ONLY');
 const db=env.TPW_DB,now=nowFn();
 if(!Number.isSafeInteger(now))throw Error('DEVICE_VIEW_CLOCK');
 const query='SELECT h.variant_key,h.revision_hash,r.previous_hash,r.data_hash,r.evidence_hash,r.spec_json,r.recorded_at,v.brand,v.sku,v.region,a.review_hash,a.candidate_hash,a.run_slot,e.article_json,e.proof_json,z.epoch FROM tpw_revision_heads h LEFT JOIN tpw_device_variants v ON v.variant_key=h.variant_key LEFT JOIN tpw_device_revisions r ON r.revision_hash=h.revision_hash AND r.variant_key=h.variant_key LEFT JOIN tpw_revision_approvals a ON a.revision_hash=h.revision_hash LEFT JOIN tpw_device_evidence e ON e.revision_hash=h.revision_hash CROSS JOIN tpw_revision_authority z WHERE z.singleton=1 ORDER BY h.variant_key LIMIT 31';
 const read=async()=>{const x=await db.prepare(query).all();if(!x.success||!Array.isArray(x.results)||!x.results.length||x.results.length>30)throw Error('DEVICE_VIEW_EMPTY_OR_LIMIT');return x.results};
 const rows=await read(),phones=[],checks=[];
 for(const row of rows){
  if(!HASH.test(row.variant_key||'')||!HASH.test(row.revision_hash||'')||typeof row.article_json!=='string'||typeof row.proof_json!=='string'||row.article_json.length>60000||row.proof_json.length>16000||!Number.isSafeInteger(row.recorded_at)||row.recorded_at>now)throw Error('DEVICE_VIEW_EVIDENCE');
  const d=JSON.parse(row.article_json),proof=JSON.parse(row.proof_json);
  if(d.kind!=='device'||!publicationGate(d,{releaseGate:'OPEN'}).ok||d.sources.some(s=>s.rights!=='LINK_ONLY'||!/^(?:[a-z0-9-]+\.)*example\.(?:org|net|com)$/.test(new URL(s.url).hostname)))throw Error('DEVICE_VIEW_POLICY');
  const v=await variantRevision(d),p=await verifyRevisionProofs(env,d,row.previous_hash,row.run_slot,proof,now);
  const reviewHash=await candidateDigest(d.review),revisionHash=await candidateDigest([v.variantKey,row.previous_hash,v.dataHash,v.evidenceHash,reviewHash,d.sourceDigest,p.proofHash]);
  const specs=JSON.stringify(Object.fromEntries(Object.keys(d.device.specifications).sort().map(k=>[k,d.device.specifications[k]])));
  if(v.variantKey!==row.variant_key||v.dataHash!==row.data_hash||v.evidenceHash!==row.evidence_hash||reviewHash!==row.review_hash||d.sourceDigest!==row.candidate_hash||revisionHash!==row.revision_hash||specs!==row.spec_json||d.device.brand!==row.brand||d.device.sku!==row.sku||d.device.region!==row.region||p.epoch!==row.epoch)throw Error('DEVICE_VIEW_BINDING');
  const revoked=await db.prepare('SELECT count(*) AS n FROM tpw_revision_revocations WHERE token IN ('+p.tokens.map(()=>'?').join(',')+')').bind(...p.tokens).first();
  if(revoked?.n!==0)throw Error('DEVICE_VIEW_REVOKED');
  checks.push(p.expiresAt);
  phones.push({id:v.variantKey,name:d.device.brand+' '+d.device.model+' · '+d.device.sku+' / '+d.device.region,spec:FIELDS.map(k=>{const s=d.device.specifications[k];return s?s.value+' '+s.unit:null})});
 }
 // Detect changes during async validation. This is not a receiver-side revocation fence.
 if(JSON.stringify(await read())!==JSON.stringify(rows)||checks.some(t=>t<=nowFn()))throw Error('DEVICE_VIEW_CHANGED');
 return {status:'LOCAL_SYNTHETIC_DEVICES',phones};
}
export function startLocalDevicePreview(env,port=0,nowFn=Date.now){
 const pins={...env};
 if(pins.TPW_MODE!=='LOCAL_DRY_RUN'||pins.TPW_RELEASE_GATE!=='CLOSED'||pins.TPW_GITHUB_WRITES!=='DISABLED')throw Error('DEVICE_VIEW_LOCAL_ONLY');
 return startLocalText(port,{loadPhones:()=>loadLocalDeviceView(pins,nowFn)});
}
