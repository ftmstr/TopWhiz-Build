/** Read-only, local-only preflight. Never print values or accept a release override. */
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../pilot/manifest.json',import.meta.url),'utf8'));
export const inventory=Object.freeze(manifest.groups.flatMap(g=>g.names));
const safeKeys=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const specs={
 'wrangler.jsonc':{name:'topwhiz-tpw-orchestrator',mode:'CLOSED',date:'2026-11-23',workflow:'topwhiz-tpw-agent',d1:false},
 'wrangler.ci-local.jsonc':{name:'topwhiz-tpw-ci-isolated',mode:'LOCAL_DRY_RUN',date:'2026-11-11',workflow:'topwhiz-tpw-agent-ci',d1:true},
 'wrangler.ci-d1.jsonc':{name:'topwhiz-tpw-d1-ci-proxy',mode:'CLOSED',date:'2026-11-23',workflow:null,d1:true}
};
export function validateClosedConfig(name,c){
 if(!Object.hasOwn(specs,name))return {ok:false,errors:['CONFIG_PROFILE_UNKNOWN']};
 const p=specs[name],e=[],keys=['name','main','compatibility_date','workers_dev','triggers','vars',...(p.workflow?['workflows']:[]),...(p.d1?['d1_databases']:[])];
 if(!safeKeys(c,keys))e.push('CONFIG_FIELDS_DENIED');
 if(c?.name!==p.name||c?.main!=='src/index.mjs'||c?.compatibility_date!==p.date||c?.workers_dev!==false)e.push('WORKER_IDENTITY_DENIED');
 if(!safeKeys(c?.triggers,['crons'])||!Array.isArray(c.triggers.crons)||c.triggers.crons.length!==0)e.push('CRON_DENIED');
 if(!safeKeys(c?.vars,['TPW_MODE','TPW_RELEASE_GATE','TPW_GITHUB_WRITES'])||c.vars.TPW_MODE!==p.mode||c.vars.TPW_RELEASE_GATE!=='CLOSED'||c.vars.TPW_GITHUB_WRITES!=='DISABLED')e.push('RELEASE_CONFIG_DENIED');
 if(p.workflow){
  const w=c?.workflows?.[0];
  if(!Array.isArray(c?.workflows)||c.workflows.length!==1||!safeKeys(w,['binding','name','class_name'])||w.binding!=='TPW_AGENT_WORKFLOW'||w.name!==p.workflow||w.class_name!=='TPWAgentWorkflow')e.push('WORKFLOW_DENIED');
 }
 if(p.d1){
  const d=c?.d1_databases?.[0];
  if(!Array.isArray(c?.d1_databases)||c.d1_databases.length!==1||!safeKeys(d,['binding','database_name','database_id'])||d.binding!=='TPW_DB'||d.database_name!=='topwhiz-tpw-synthetic-ci'||d.database_id!=='00000000-0000-0000-0000-000000000165')e.push('D1_BINDING_DENIED');
 }
 return {ok:e.length===0,errors:e};
}
export function inspectSetup(configs,env={}){
 const profiles=Object.keys(specs).map(name=>({name,...validateClosedConfig(name,configs?.[name])}));
 const groups=manifest.groups.map(g=>({id:g.id,label:g.label,items:g.names.map(name=>({name,kind:manifest.secretNames.includes(name)?'SECRET':g.kind==='binding'?'BINDING':'CONFIG',state:g.kind==='binding'?'LOCAL_BINDING_ONLY':typeof env[name]==='string'&&env[name].length>0?'PRESENT_UNVERIFIED':'NOT_SET'}))}));
 return {release:'HARD_NO_GO',pilot:'BLOCKED',closedConfig:profiles.every(p=>p.ok),profiles,groups,blockers:[...manifest.blockers]};
}
export function loadClosedConfigs(){
 return Object.fromEntries(Object.keys(specs).map(n=>[n,JSON.parse(readFileSync(new URL('../'+n,import.meta.url),'utf8'))]));
}
