/** Synthetic local revision ledger. Never authorizes a real publication or a license grant. */
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
export async function appendReviewedRevision({env,owned,article,expectedHead,scope,nowFn=Date.now}){
 if(env.TPW_MODE!=='LOCAL_DRY_RUN'||env.TPW_RELEASE_GATE!=='CLOSED'||env.TPW_GITHUB_WRITES!=='DISABLED')throw Error('REVISION_LOCAL_ONLY');
 const db=env.TPW_DB,c=owned.candidate;
 if(!publicationGate(article,{releaseGate:'OPEN'}).ok||article.id!==owned.id||c.id!==owned.id||article.sourceDigest!==await candidateDigest(c)||!originMatches(c,article))throw Error('REVISION_APPROVAL_INVALID');
 const rights=syntheticRights(article),v=await variantRevision(article),d=article.device;
 if(v.variantKey!==await deviceVariantKey(c)||!(expectedHead===null||HASH.test(expectedHead)))throw Error('REVISION_EXPECTED_HEAD');
 const current=await readRevisionHead(db,v.variantKey);
 if((current?.revision_hash??null)!==expectedHead)throw Error('REVISION_CAS_LOST');
 const unchanged=current?.data_hash===v.dataHash&&current?.evidence_hash===v.evidenceHash;
 const reviewHash=await digest(article.review),revisionHash=await digest([v.variantKey,expectedHead,v.dataHash,v.evidenceHash,reviewHash,article.sourceDigest]);
 const specJson=JSON.stringify(Object.fromEntries(Object.keys(d.specifications).sort().map(k=>[k,d.specifications[k]])));
 await scope.guard();
 const now=nowFn();
 if(!Number.isSafeInteger(now))throw Error('REVISION_CLOCK');
 // The final D1 batch includes the exact stage lease, TPW2 run owner, previous head, revision,
 // evidence and stage acknowledgement. A NOT NULL violation on any failed guard rolls back the batch.
 const fence="EXISTS (SELECT 1 FROM tpw_stage WHERE candidate_id=? AND run_slot=? AND state='PROCESSING' AND lease_owner=? AND lease_until>? AND expires_at>?) AND EXISTS (SELECT 1 FROM tpw_hourly_run WHERE slot=? AND agent='TPW2' AND owner=? AND state='RUNNING' AND deadline>?) AND ((SELECT revision_hash FROM tpw_revision_heads WHERE variant_key=?) IS ?)";
 const args=[owned.id,scope.slot,owned.leaseToken,now,now,scope.slot,scope.owner,now,v.variantKey,expectedHead];
 const stmts=[db.prepare("INSERT INTO tpw_device_variants(variant_key,brand,sku,region) VALUES(CASE WHEN "+fence+" THEN ? ELSE NULL END,?,?,?) ON CONFLICT(variant_key) DO NOTHING").bind(...args,v.variantKey,d.brand,d.sku,d.region)];
 if(!unchanged){
  stmts.push(db.prepare('INSERT INTO tpw_device_revisions(revision_hash,variant_key,previous_hash,data_hash,evidence_hash,spec_json,recorded_at) VALUES(?,?,?,?,?,?,?)').bind(revisionHash,v.variantKey,expectedHead,v.dataHash,v.evidenceHash,specJson,now));
  stmts.push(db.prepare('INSERT INTO tpw_revision_approvals(revision_hash,review_hash,candidate_hash,run_slot,approved_at) VALUES(?,?,?,?,?)').bind(revisionHash,reviewHash,article.sourceDigest,scope.slot,now));
  for(const s of rights)stmts.push(db.prepare("INSERT INTO tpw_source_rights(revision_hash,source_url,publisher,claim_hash,scope) VALUES(?,?,?,?,'SYNTHETIC_LINK_ONLY')").bind(revisionHash,s.url,s.publisher,s.claimHash));
  stmts.push(db.prepare('INSERT INTO tpw_revision_heads(variant_key,revision_hash) VALUES(?,?) ON CONFLICT(variant_key) DO UPDATE SET revision_hash=excluded.revision_hash').bind(v.variantKey,revisionHash));
 }
 stmts.push(db.prepare("UPDATE tpw_stage SET state='APPROVED',metadata_json='{}',source_url='',lease_owner=NULL,lease_until=NULL WHERE candidate_id=? AND lease_owner=? AND state='PROCESSING'").bind(owned.id,owned.leaseToken));
 const results=await db.batch(stmts);
 if(results.some(x=>!x.success)||results.at(-1).meta?.changes!==1)throw Error('REVISION_BATCH_UNCERTAIN');
 return {state:unchanged?'UNCHANGED':'APPENDED',revisionHash:unchanged?expectedHead:revisionHash};
}
