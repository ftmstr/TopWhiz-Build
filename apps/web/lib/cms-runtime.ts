import "server-only";
import { approvedContent, type PublishedPhone, type PublishedStory } from "./content-registry";

type Kind = "news" | "phone";
type Payload = Record<string,unknown>;
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function endpoint():string|null {
  const origin=process.env.TOPWHIZ_CMS_API_BASE;
  const allowed=process.env.TOPWHIZ_CMS_API_HOST;
  if(!origin||!allowed)return null;
  try{
    const url=new URL(origin);
    if(url.protocol!=="https:"||url.hostname!==allowed||url.port||url.username||
       url.password||url.pathname!=="/"||url.search||url.hash)return null;
    return url.origin;
  }catch{return null;}
}
async function getJson(path:string):Promise<unknown> {
  const base=endpoint();
  if(!base)return null;
  try{
    const res=await fetch(base+path,{
      cache:"no-store",
      headers:{Accept:"application/json"},
      signal:AbortSignal.timeout(5000)
    });
    if(!res.ok)return null;
    const text=await res.text();
    if(text.length>1000000)return null;
    return JSON.parse(text);
  }catch{return null;}
}
function obj(x:unknown):x is Payload{
  return !!x&&typeof x==="object"&&!Array.isArray(x);
}
function string(x:unknown,max=500):x is string{
  return typeof x==="string"&&x.length>0&&x.length<=max;
}
function safeSources(x:unknown):{label:string;url:string}[]{
  if(!Array.isArray(x))return [];
  return x.filter(obj).flatMap(s=>{
    if(!string(s.label,180)||!string(s.url,2048))return [];
    try{
      const url=new URL(s.url);
      if(url.protocol!=="https:"||url.username||url.password)return [];
      return [{label:s.label,url:url.toString()}];
    }catch{return [];}
  });
}
function parseNews(x:unknown):PublishedStory|null{
  if(!obj(x)||!string(x.slug,100)||!SLUG.test(x.slug)||
     !string(x.title,180)||!string(x.summary,400)||!string(x.body,30000)||
     !string(x.publishedAt,40)||!string(x.author,120))return null;
  return {slug:x.slug,title:x.title,summary:x.summary,body:x.body,
    publishedAt:x.publishedAt,author:x.author,sources:safeSources(x.sources)};
}
function parsePhone(x:unknown):PublishedPhone|null{
  if(!obj(x)||!string(x.slug,100)||!SLUG.test(x.slug)||
     !string(x.title,180)||!string(x.summary,400)||!string(x.brand,90)||
     !string(x.modelCode,120)||!string(x.market,2)||
     !Array.isArray(x.variants)||!Array.isArray(x.specifications))return null;
  const variants=x.variants.filter(obj).filter(v=>string(v.name,100)&&
    Number.isInteger(v.ramGb)&&Number.isInteger(v.storageGb)&&string(v.warrantyClass,50))
    .map(v=>({name:v.name as string,ramGb:v.ramGb as number,
      storageGb:v.storageGb as number,warrantyClass:v.warrantyClass as string}));
  const specs=x.specifications.filter(obj).filter(v=>string(v.label,160)&&
    string(v.value,280)&&string(v.sourceLabel,180)).map(v=>({
      label:v.label as string,value:v.value as string,sourceLabel:v.sourceLabel as string
    }));
  if(!variants.length||!specs.length)return null;
  return {slug:x.slug,title:x.title,summary:x.summary,brand:x.brand,
    modelCode:x.modelCode,market:x.market,variants,specifications:specs};
}
function unwrap(x:unknown):unknown{
  return obj(x)?x.content:null;
}
async function list(kind:Kind):Promise<unknown[]>{
  const response=await getJson("/v1/content?type="+kind);
  if(!obj(response)||!Array.isArray(response.items))return [];
  return response.items.slice(0,50).map(unwrap);
}
async function one(kind:Kind,slug:string):Promise<unknown>{
  if(!SLUG.test(slug)||slug.length>100)return null;
  const response=await getJson("/v1/content/"+kind+"/"+slug);
  return obj(response)?unwrap(response.item):null;
}
export async function listCmsNews():Promise<PublishedStory[]> {
  if(!endpoint())return approvedContent.news;
  return (await list("news")).map(parseNews).filter((item):item is PublishedStory=>!!item);
}
export async function listCmsPhones():Promise<PublishedPhone[]> {
  if(!endpoint())return approvedContent.phones;
  return (await list("phone")).map(parsePhone).filter((item):item is PublishedPhone=>!!item);
}
export async function getCmsNews(slug:string):Promise<PublishedStory|null>{
  if(!endpoint())return approvedContent.news.find(item=>item.slug===slug)??null;
  return parseNews(await one("news",slug));
}
export async function getCmsPhone(slug:string):Promise<PublishedPhone|null>{
  if(!endpoint())return approvedContent.phones.find(item=>item.slug===slug)??null;
  return parsePhone(await one("phone",slug));
}
