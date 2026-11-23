/** D1 stores minimal prefiltered metadata; no third-party article text or images. */
const TTL=2*60*60*1000;
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
export async function finishStage(db,id,state){
 if(!['REJECTED','APPROVED','QUARANTINED'].includes(state))throw new Error('BAD_STATE');
 await db.prepare("UPDATE tpw_stage SET state=?,metadata_json='{}',source_url='' WHERE candidate_id=? AND state='PENDING'").bind(state,id).run();
}
export async function cleanupStage(db,now=Date.now()){
 if(!db)throw new Error('STAGING_DB_UNAVAILABLE');
 await db.prepare("DELETE FROM tpw_stage WHERE expires_at<? OR state IN ('REJECTED','APPROVED')").bind(now).run();
}