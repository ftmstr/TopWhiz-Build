/** Synthetic local revision ledger. Never authorizes a real publication or a license grant. */
import {verifyRevisionProofs} from './revision-proofs.mjs';
import {variantRevision} from './source-identity.mjs';
import {candidateDigest,originMatches} from './lineage.mjs';
import {publicationGate,preflightCandidate} from './policy.mjs';
const HASH=/^[a-f0-9]{64}$/;
async function digest(x){return candidateDigest(x)}
export async function readRevisionHead(db,key){
 if(!HASH.test(key))throw Error('REVISION_KEY');
 return await db.prepare('SELECT r.revision_hash,r.data_hash,r.evidence_hash FROM tpw_revision_heads h JOIN tpw_device_revisions r ON r.revision_hash=h.revision_hash AND r.variant_key=h.variant_key WHERE h.variant_key=?').bind(key).first()??null;
}
export async function deviceVariantKey(candidate){
 if(candidate?.kind!=='device'||!preflightCandidate(candidate).ok)throw Error('REVISION_CANDIDATE');
 const d=candidate.device;return digest([d.brand,d.sku,d.region]);
}
function syntheticRights(doc){
 if(!doc.sources.every(s=>s.rights==='LINK_ONLY'&&/^(?:[a-z0-9-]+\.)*example\.(?:org|net|com)$/.test(new URL(s.url).hostname)))throw Error('REVISION_RIGHTS_UNVERIFIED');
 const seen=new Set();
 return doc.sources.map(s=>{const k=JSON.stringify([s.url,s.claimHash]);if(seen.has(k))throw Error('REVISION_DUPLICATE_RIGHTS');seen.add(k);return s});
}
// A data/evidence hash match alone cannot keep an expired or pre-migration proof current.
// Only an independently reverified, identically authorized immutable head is reusable.
async function reusableHeadEvidence(db,env,current,variant,verified,now){
 if(current?.data_hash!==variant.dataHash||current?.evidence_hash!==variant.evidenceHash)return false;
 const row=await db.prepare('SELECT r.previous_hash,a.run_slot,e.article_json,e.proof_json FROM tpw_device_revisions r JOIN tpw_revision_approvals a ON a.revision_hash=r.revision_hash JOIN tpw_device_evidence e ON e.revision_hash=r.revision_hash WHERE r.revision_hash=?').bind(current.revision_hash).first();
 if(!row)return false;
 try{
  const article=JSON.parse(row.article_json),proof=JSON.parse(row.proof_json);
  syntheticRights(article);
  const v=await variantRevision(article),old=await verifyRevisionProofs(env,article,row.previous_hash,row.run_slot,proof,now);
  const hash=await digest([v.variantKey,row.previous_hash,v.dataHash,v.evidenceHash,await digest(article.review),article.sourceDigest,old.proofHash]);
  return hash===current.revision_hash&&v.variantKey===variant.variantKey&&v.dataHash===variant.dataHash&&v.evidenceHash===variant.evidenceHash&&old.epoch===verified.epoch&&old.expiresAt===verified.expiresAt&&JSON.stringify([...old.tokens].sort())===JSON.stringify([...verified.tokens].sort());
 }catch{return false}
}
export async function appendReviewedRevision({env,owned,article,expectedHead,scope,proof,nowFn=Date.now}){
 if(env.TPW_MODE!=='LOCAL_DRY_RUN'||env.TPW_RELEASE_GATE!=='CLOSED'||env.TPW_GITHUB_WRITES!=='DISABLED')throw Error('REVISION_LOCAL_ONLY');
 // Capture caller-owned data before signature checks and asynchronous D1 calls.
 article=JSON.parse(JSON.stringify(article));proof=JSON.parse(JSON.stringify(proof??null));
 const db=env.TPW_DB,c=owned.candidate;
 if(!publicationGate(article,{releaseGate:'OPEN'}).ok||article.id!==owned.id||c.id!==owned.id||article.sourceDigest!==await candidateDigest(c)||!originMatches(c,article))throw Error('REVISION_APPROVAL_INVALID');
 const rights=syntheticRights(article),v=await variantRevision(article),d=article.device;
 if(v.variantKey!==await deviceVariantKey(c)||!(expectedHead===null||HASH.test(expectedHead)))throw Error('REVISION_EXPECTED_HEAD');
 const verified=await verifyRevisionProofs(env,article,expectedHead,scope.slot,proof,nowFn());
 const op=await digest(['TPW_REVISION_OPERATION_V1',owned.id,scope.slot,expectedHead,article.sourceDigest,verified.proofHash]);
 const reconcile=async()=>{
  const row=await db.prepare('SELECT revision_hash,candidate_id,run_slot,proof_hash,outcome,authority_epoch FROM tpw_revision_operations WHERE operation_hash=?').bind(op).first();
  if(!row)return null;
  if(row.candidate_id!==owned.id||row.run_slot!==scope.slot||row.proof_hash!==verified.proofHash||row.authority_epoch!==verified.epoch||!HASH.test(row.revision_hash))throw Error('REVISION_RECEIPT_MISMATCH');
  return {state:row.outcome,revisionHash:row.revision_hash,reconciled:true};
 };
 const priorReceipt=await reconcile();if(priorReceipt)return priorReceipt;
 const current=await readRevisionHead(db,v.variantKey);
 if((current?.revision_hash??null)!==expectedHead)throw Error('REVISION_CAS_LOST');
 const unchanged=await reusableHeadEvidence(db,env,current,v,verified,nowFn());
 const reviewHash=await digest(article.review),revisionHash=await digest([v.variantKey,expectedHead,v.dataHash,v.evidenceHash,reviewHash,article.sourceDigest,verified.proofHash]);
 const specJson=JSON.stringify(Object.fromEntries(Object.keys(d.specifications).sort().map(k=>[k,d.specifications[k]])));
 await scope.guard();
 const now=nowFn();
 if(!Number.isSafeInteger(now)||now>=verified.expiresAt)throw Error('REVISION_CLOCK_OR_GRANT_EXPIRED');
 // The final D1 batch includes the exact stage lease, TPW2 run owner, previous head, revision,
 // evidence and stage acknowledgement. A NOT NULL violation on any failed guard rolls back the batch.
 const fence="(SELECT epoch FROM tpw_revision_authority WHERE singleton=1)=? AND NOT EXISTS (SELECT 1 FROM tpw_revision_revocations WHERE token IN ("+verified.tokens.map(()=>'?').join(',')+")) AND EXISTS (SELECT 1 FROM tpw_stage WHERE candidate_id=? AND run_slot=? AND state='PROCESSING' AND lease_owner=? AND lease_until>? AND expires_at>?) AND EXISTS (SELECT 1 FROM tpw_hourly_run WHERE slot=? AND agent='TPW2' AND owner=? AND state='RUNNING' AND deadline>?) AND ((SELECT revision_hash FROM tpw_revision_heads WHERE variant_key=?) IS ?)";
 const args=[verified.epoch,...verified.tokens,owned.id,scope.slot,owned.leaseToken,now,now,scope.slot,scope.owner,now,v.variantKey,expectedHead];
 const stmts=[db.prepare("INSERT INTO tpw_device_variants(variant_key,brand,sku,region) VALUES(CASE WHEN "+fence+" THEN ? ELSE NULL END,?,?,?) ON CONFLICT(variant_key) DO NOTHING").bind(...args,v.variantKey,d.brand,d.sku,d.region)];
 if(!unchanged){
  stmts.push(db.prepare('INSERT INTO tpw_device_revisions(revision_hash,variant_key,previous_hash,data_hash,evidence_hash,spec_json,recorded_at) VALUES(?,?,?,?,?,?,?)').bind(revisionHash,v.variantKey,expectedHead,v.dataHash,v.evidenceHash,specJson,now));
  stmts.push(db.prepare('INSERT INTO tpw_device_evidence(revision_hash,article_json,proof_json) VALUES(?,?,?)').bind(revisionHash,JSON.stringify(article),JSON.stringify(proof)));
  stmts.push(db.prepare('INSERT INTO tpw_revision_approvals(revision_hash,review_hash,candidate_hash,run_slot,approved_at) VALUES(?,?,?,?,?)').bind(revisionHash,reviewHash,article.sourceDigest,scope.slot,now));
  for(const s of rights)stmts.push(db.prepare("INSERT INTO tpw_source_rights(revision_hash,source_url,publisher,claim_hash,scope) VALUES(?,?,?,?,'SYNTHETIC_LINK_ONLY')").bind(revisionHash,s.url,s.publisher,s.claimHash));
  stmts.push(db.prepare('INSERT INTO tpw_revision_heads(variant_key,revision_hash) VALUES(?,?) ON CONFLICT(variant_key) DO UPDATE SET revision_hash=excluded.revision_hash').bind(v.variantKey,revisionHash));
 }
 stmts.push(db.prepare('INSERT INTO tpw_revision_operations(operation_hash,revision_hash,candidate_id,run_slot,proof_hash,outcome,recorded_at,authority_epoch) VALUES(?,?,?,?,?,?,?,?)').bind(op,unchanged?expectedHead:revisionHash,owned.id,scope.slot,verified.proofHash,unchanged?'UNCHANGED':'APPENDED',now,verified.epoch));
 stmts.push(db.prepare("UPDATE tpw_stage SET state='APPROVED',metadata_json='{}',source_url='',lease_owner=NULL,lease_until=NULL WHERE candidate_id=? AND lease_owner=? AND state='PROCESSING'").bind(owned.id,owned.leaseToken));
 try{
  const results=await db.batch(stmts);
  if(results.some(x=>!x.success)||results.at(-1).meta?.changes!==1)throw Error('REVISION_BATCH_UNCERTAIN');
 }catch(error){
  // No blind replay after an uncertain response. A matching durable receipt is historical evidence only.
  const receipt=await reconcile();if(receipt)return receipt;
  throw error;
 }
 return {state:unchanged?'UNCHANGED':'APPENDED',revisionHash:unchanged?expectedHead:revisionHash};
}
