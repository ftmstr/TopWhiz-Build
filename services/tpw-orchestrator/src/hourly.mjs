/** D1 is the hourly authority; Workflow completion is not an agent success receipt. */
import {executeAgent} from './runner.mjs';
const minutes=Object.freeze({TPW1:0,TPW3:20,TPW2:40});
export function slotWindow(agent,slot){
 if(!Object.hasOwn(minutes,agent)||typeof slot!=='string'||!/^\d{10}$/.test(slot))throw Error('INVALID_RUN_SLOT');
 const iso=slot.slice(0,4)+'-'+slot.slice(4,6)+'-'+slot.slice(6,8)+'T'+slot.slice(8,10)+':00:00.000Z';
 const t=Date.parse(iso);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==iso)throw Error('INVALID_RUN_SLOT');
 return {start:t+minutes[agent]*60_000,end:t+3600_000};
}
export const RUN_RETENTION_MS=30*24*3600_000;
export async function pruneHourlyRuns(db,now){
 if(!Number.isSafeInteger(now))throw Error('RUN_CLOCK_INVALID');
 const r=await db.prepare("DELETE FROM tpw_hourly_run WHERE state IN ('SUCCEEDED','FAILED') AND finished_at<? AND NOT EXISTS (SELECT 1 FROM tpw_stage WHERE run_slot=tpw_hourly_run.slot)").bind(now-RUN_RETENTION_MS).run();
 return r.meta?.changes||0;
}
export async function executeHourly({agent,slot,env,fetcher=fetch,nowFn=Date.now}){
 if(env.TPW_MODE==='CLOSED')return {agent,state:'DISABLED_NO_GO',githubWrites:0};
 if(!['LOCAL_DRY_RUN','PRIVATE_PILOT'].includes(env.TPW_MODE)||env.TPW_RELEASE_GATE!=='CLOSED'||!env.TPW_DB)throw Error('RUN_CONFIG_INVALID');
 const db=env.TPW_DB,{start,end}=slotWindow(agent,slot),now=nowFn();
 if(!Number.isSafeInteger(now))throw Error('RUN_CLOCK_INVALID');
 if(now<start||now>=end)return {agent,slot,state:'OUTSIDE_SLOT',githubWrites:0};
 await pruneHourlyRuns(db,now);
 // Terminal failure is permanent for a slot. A crashed owner is never stolen/replayed.
 await db.prepare("UPDATE tpw_hourly_run SET state='FAILED',finished_at=? WHERE state='RUNNING' AND deadline<=?").bind(now,now).run();
 const owner=crypto.randomUUID();
 const claim=await db.prepare("INSERT OR IGNORE INTO tpw_hourly_run(slot,agent,state,owner,started_at,deadline) SELECT ?,?,'RUNNING',?,?,? WHERE (?<>'TPW2' OR (SELECT count(*) FROM tpw_hourly_run WHERE slot=? AND agent IN ('TPW1','TPW3') AND state='SUCCEEDED' AND deadline=? AND finished_at<=?)=2)")
 .bind(slot,agent,owner,now,end,agent,slot,end,now).run();
 if(claim.meta?.changes!==1){
  const existing=await db.prepare('SELECT state FROM tpw_hourly_run WHERE slot=? AND agent=?').bind(slot,agent).first();
  return {agent,slot,state:existing?'DUPLICATE_'+existing.state:'DEPENDENCIES_NOT_READY',githubWrites:0};
 }
 const guard=async()=>{
  const at=nowFn();
  if(!Number.isSafeInteger(at)||at<start||at>=end)throw Error('RUN_DEADLINE_LOST');
  const row=await db.prepare("SELECT 1 AS ok FROM tpw_hourly_run WHERE slot=? AND agent=? AND owner=? AND state='RUNNING' AND deadline>?").bind(slot,agent,owner,at).first();
  if(!row)throw Error('RUN_OWNERSHIP_LOST');
 };
 const finish=async(state)=>{
  const at=nowFn();
  const result=await db.prepare("UPDATE tpw_hourly_run SET state=?,finished_at=? WHERE slot=? AND agent=? AND owner=? AND state='RUNNING' AND (?='FAILED' OR (deadline>? AND started_at<=?))").bind(state,at,slot,agent,owner,state,at,at).run();
  if(result.meta?.changes!==1)throw Error('RUN_FINISH_LOST');
 };
 try{
  await guard();
  const result=await executeAgent({agent,env,fetcher,clock:now,nowFn,scope:{slot,guard,owner}});
  const success=agent==='TPW2'?result.state==='NO_PUBLICATION':result.state==='STAGED_METADATA';
  if(success)await guard();
  await finish(success?'SUCCEEDED':'FAILED');
  return {...result,slot,runState:success?'SUCCEEDED':'FAILED'};
 }catch{
  await finish('FAILED');
  return {agent,slot,state:'RUN_FAILED',runState:'FAILED',githubWrites:null};
 }
}
