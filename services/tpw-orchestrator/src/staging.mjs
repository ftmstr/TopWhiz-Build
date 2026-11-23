/** D1 stores only filtered metadata. A processing lease prevents concurrent TPW2 runs from editing the same candidate. */
const TTL=2*60*60*1000,LEASE_MS=5*60*1000;
export async function stageCandidates(db,records,now=Date.now()){
 if(!db)throw new Error('STAGING_DB_UNAVAILABLE');
 let accepted=0;
 for(const c of records){
  const json=JSON.stringify(c);if(json.length>8000)continue;
  const r=await db.prepare("INSERT OR IGNORE INTO tpw_stage (candidate_id,kind,source_url,metadata_json,observed_at,expires_at,state) VALUES (?,?,?,?,?,?,'PENDING')")
   .bind(c.id,c.kind,c.source.url,json,c.observedAt,now+TTL).run();
  accepted+=r.meta?.changes||0;
 }
 return accepted;
}
export async function readStage(db,now=Date.now()){
 if(!db)throw new Error('STAGING_DB_UNAVAILABLE');
 const r=await db.prepare("SELECT candidate_id,metadata_json FROM tpw_stage WHERE state='PENDING' AND expires_at>? ORDER BY observed_at ASC LIMIT 30").bind(now).all();
 return (r.results||[]).map(x=>({id:x.candidate_id,candidate:JSON.parse(x.metadata_json)}));
}
const tokenValid=t=>typeof t==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(t);
export async function claimStage(db,id,token,now=Date.now()){
 if(!db||!tokenValid(token)||!Number.isFinite(now))throw new Error('LEASE_INPUT_INVALID');
 const result=await db.prepare("UPDATE tpw_stage SET state='PROCESSING',lease_owner=?,lease_until=? WHERE candidate_id=? AND state='PENDING' AND expires_at>?")
  .bind(token,now+LEASE_MS,id,now).run();
 if(result.meta?.changes!==1)return null;
 const row=await db.prepare("SELECT candidate_id,metadata_json FROM tpw_stage WHERE candidate_id=? AND state='PROCESSING' AND lease_owner=?").bind(id,token).first();
 if(!row)throw new Error('LEASE_CLAIM_LOST');
 return {id:row.candidate_id,candidate:JSON.parse(row.metadata_json),leaseToken:token};
}
export async function assertStageLease(db,id,token,now=Date.now()){
 if(!db||!tokenValid(token)||!Number.isFinite(now))throw new Error('LEASE_INPUT_INVALID');
 const row=await db.prepare("SELECT 1 AS owned FROM tpw_stage WHERE candidate_id=? AND state='PROCESSING' AND lease_owner=? AND lease_until>? AND expires_at>?")
  .bind(id,token,now,now).first();
 if(!row)throw new Error('LEASE_LOST_NO_GITHUB_WRITE');
 return true;
}
export async function finishStage(db,id,state,token,now=Date.now()){
 if(!['REJECTED','APPROVED','QUARANTINED'].includes(state)||!tokenValid(token)||!Number.isFinite(now))throw new Error('FINISH_INPUT_INVALID');
 const r=await db.prepare("UPDATE tpw_stage SET state=?,metadata_json='{}',source_url='',lease_owner=NULL,lease_until=NULL WHERE candidate_id=? AND state='PROCESSING' AND lease_owner=? AND lease_until>? AND expires_at>?")
  .bind(state,id,token,now,now).run();
 if(r.meta?.changes!==1)throw new Error('LEASE_LOST_ON_FINISH');
 return true;
}
export async function cleanupStage(db,now=Date.now()){
 if(!db)throw new Error('STAGING_DB_UNAVAILABLE');
 // If a worker disappeared, do not replay a possibly committed external write.
 await db.prepare("UPDATE tpw_stage SET state='QUARANTINED',metadata_json='{}',source_url='',lease_owner=NULL,lease_until=NULL WHERE state='PROCESSING' AND lease_until<=? AND expires_at>?").bind(now,now).run();
 // Retain scrubbed terminal tombstones for the TTL; duplicate messages cannot be re-staged immediately.
 await db.prepare("DELETE FROM tpw_stage WHERE expires_at<=?").bind(now).run();
}
