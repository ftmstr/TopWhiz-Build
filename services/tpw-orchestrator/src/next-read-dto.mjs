/** Server-side read boundary for a future Next.js adapter. No transport or public route. */
import {loadUnifiedView} from './local-unified-view.mjs';
const fields=Object.freeze(['screen','chip','ram','storage','battery','weight','network']);
const HASH=/^[a-f0-9]{64}$/;
const str=(s,max)=>typeof s==='string'&&s.length>0&&s.length<=max;
const triple=a=>Array.isArray(a)&&a.length===3&&a.every(s=>str(s,60000));
export async function readTpwNextDto(env,nowFn=Date.now){
 // Never accept a caller-supplied DTO, browser JSON, cached snapshot or fixture fallback.
 // loadUnifiedView verifies both signed projections and fences ordinary concurrent writers.
 const {news,devices}=await loadUnifiedView(env,nowFn);
 if(news.status!=='LOCAL_SYNTHETIC_NEWS'||devices.status!=='LOCAL_SYNTHETIC_DEVICES'||!Number.isSafeInteger(news.generation)||news.generation<1||
 !Array.isArray(news.stories)||!news.stories.length||news.stories.length>30||!Array.isArray(devices.phones)||!devices.phones.length||devices.phones.length>30)throw Error('NEXT_DTO_SHAPE');
 const stories=news.stories.map(s=>{
  if(!triple(s.tr)||!triple(s.en))throw Error('NEXT_DTO_TRANSLATION');
  return {category:null,tr:{title:s.tr[0],summary:s.tr[1],body:s.tr[2]},en:{title:s.en[0],summary:s.en[1],body:s.en[2]}};
 });
 const ids=new Set();
 const phones=devices.phones.map(p=>{
  if(!HASH.test(p.id)||ids.has(p.id)||!str(p.name,1024)||!Array.isArray(p.spec)||p.spec.length!==fields.length||p.spec.some(v=>v!==null&&!str(v,1024)))throw Error('NEXT_DTO_VARIANT');
  ids.add(p.id);
  // name is the verified combined label; no heuristic splitting of brand/model/SKU/region.
  return {variantId:p.id,label:p.name,specifications:Object.fromEntries(fields.map((k,i)=>[k,p.spec[i]]))};
 });
 return {schemaVersion:'1.0',mode:'LOCAL_SYNTHETIC_SIGNED',publication:'HARD_NO_GO',dragonPoint:'DISABLED',generation:news.generation,categoryFiltering:false,stories,phones};
}
