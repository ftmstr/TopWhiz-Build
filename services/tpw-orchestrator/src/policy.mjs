/** Strict TPW pre-Git whitelist and bilingual approved-content gate. */
export const AGENTS = Object.freeze({'0 * * * *':'TPW1','20 * * * *':'TPW3','40 * * * *':'TPW2'});
const ID=/^(?:news|device)_[a-z0-9][a-z0-9_-]{5,90}$/;
const HASH=/^[a-f0-9]{64}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=(x,a,b)=>typeof x==='string'&&x.trim().length>=a&&x.length<=b;
const exact=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const time=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const lang=(x,min,max)=>exact(x,['tr','en'])&&Object.keys(x).length===2&&str(x.tr,min,max)&&str(x.en,min,max);
const rights=x=>x==='LINK_ONLY'||x==='PERMISSION_GRANTED';
function https(u){
 if(!str(u,9,1800))return false;
 try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password&&!x.hash&&x.hostname.length>3&&!x.hostname.endsWith('.local')&&!x.hostname.endsWith('.internal')&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(x.hostname)}
 catch{return false}
}
export function preflightCandidate(x){
 const e=[];
 if(!exact(x,['id','kind','source','observedAt','title','device']))e.push('UNEXPECTED_FIELDS');
 if(!ID.test(x?.id||''))e.push('ID');
 if(!['news','device'].includes(x?.kind)||!time(x?.observedAt)||!str(x?.title,8,180))e.push('CANDIDATE');
 const s=x?.source;
 if(!exact(s,['url','publisher','rights','type'])||!https(s.url)||!str(s.publisher,2,100)||!rights(s.rights)||s.type!=='PRIMARY')e.push('SOURCE');
 if(x?.kind==='device'){
  const d=x.device;
  if(!exact(d,['brand','model','sku','region'])||!str(d.brand,2,50)||!str(d.model,2,120)||!str(d.sku,2,70)||!/^[A-Z]{2}$/.test(d.region||''))e.push('VARIANT');
 }else if(x?.kind==='news'&&Object.hasOwn(x,'device'))e.push('EXTRA_DEVICE');
 return {ok:e.length===0,errors:e};
}
export function publicationGate(x,{releaseGate}={}){
 const e=[];
 if(!exact(x,['schemaVersion','id','kind','status','title','summary','body','sources','review','device','media','publishedAt','sourceDigest']))e.push('UNKNOWN_FIELDS');
 if(x?.schemaVersion!=='1.0'||x?.status!=='APPROVED'||!ID.test(x?.id||'')||!['news','device'].includes(x?.kind))e.push('NOT_APPROVED');
 if(!lang(x?.title,8,180)||!lang(x?.summary,16,600)||!lang(x?.body,40,15000))e.push('BILINGUAL');
 if(!time(x?.publishedAt)||!HASH.test(x?.sourceDigest||''))e.push('PROVENANCE_DIGEST');
 if(!Array.isArray(x?.media)||x.media.length!==0)e.push('MEDIA_NO_GO');
 const r=x?.review;
 if(!exact(r,['agent','decision','factCheck','rightsCheck','translationCheck','reviewedAt','evidenceHash'])||r.agent!=='TPW2'||r.decision!=='APPROVED'||r.factCheck!=='VERIFIED'||r.rightsCheck!=='CLEARED'||r.translationCheck!=='VERIFIED'||!time(r.reviewedAt)||!HASH.test(r.evidenceHash||''))e.push('EDITOR_PROOF');
 if(!Array.isArray(x?.sources)||x.sources.length<1||x.sources.length>6)e.push('SOURCES');
 else {
  const pubs=new Set();let primary=false;
  for(const s of x.sources){
   if(!exact(s,['url','publisher','rights','type','checkedAt','claimHash'])||!https(s.url)||!str(s.publisher,2,100)||!rights(s.rights)||!['PRIMARY','INDEPENDENT'].includes(s.type)||!time(s.checkedAt)||!HASH.test(s.claimHash||'')){e.push('INVALID_SOURCE');continue;}
   pubs.add(s.publisher.toLowerCase());if(s.type==='PRIMARY')primary=true;
  }
  if(!primary)e.push('PRIMARY_REQUIRED');
  if(x.kind==='news'&&pubs.size<2)e.push('CORROBORATION_REQUIRED');
 }
 if(x?.kind==='device'){
  const d=x.device;
  if(!exact(d,['brand','model','sku','region','specifications'])||!str(d.brand,2,50)||!str(d.model,2,120)||!str(d.sku,2,70)||!/^[A-Z]{2}$/.test(d.region||'')||!object(d.specifications)||Object.keys(d.specifications).length===0)e.push('DEVICE_SPECS');
  else if(Object.entries(d.specifications).some(([k,v])=>!/^[a-z][a-z0-9_]{1,40}$/.test(k)||!exact(v,['value','unit','sourceHash'])||!str(v.value,1,120)||!str(v.unit,1,24)||!HASH.test(v.sourceHash||'')))e.push('SPEC_EVIDENCE');
 } else if(x?.kind==='news'&&Object.hasOwn(x,'device'))e.push('EXTRA_DEVICE');
 if(releaseGate!=='OPEN')e.push('GLOBAL_RELEASE_NO_GO');
 return {ok:e.length===0,errors:e};
}
export function safeApprovedPath(x){
 if(!ID.test(x?.id||''))throw new Error('UNSAFE_CONTENT_PATH');
 if(!['news','device'].includes(x.kind))throw new Error('UNKNOWN_KIND');
 return 'content-approved/'+(x.kind==='news'?'news/':'devices/')+x.id+'.json';
}
export function slotForCron(cron,scheduledTime){
 const agent=AGENTS[cron];if(!agent)throw new Error('UNKNOWN_CRON_FAIL_CLOSED');
 if(!Number.isFinite(scheduledTime))throw new Error('INVALID_TRIGGER_TIME');
 const t=new Date(scheduledTime);
 if(Number.isNaN(t.getTime())||t.getUTCMinutes()!==Number(cron.split(' ')[0]))throw new Error('CRON_TIME_MISMATCH');
 const slot=t.toISOString().slice(0,13).replaceAll('-','').replace('T','');
 return {agent,slot,id:'tpw-'+agent.toLowerCase()+'-'+slot};
}