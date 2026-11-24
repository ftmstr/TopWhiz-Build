/** Bounded, metadata-only source adapters. No live source is configured in this repository. */
import {assertTrustedEndpoint,boundedResponseText,prefilterFeed} from './adapters.mjs';
const MAX=256*1024, atomNS='http://www.w3.org/2005/Atom';
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>plain(x)&&Object.keys(x).every(k=>keys.includes(k));
const clean=s=>typeof s==='string'&&!/[\u0000-\u001f\u007f<>]/.test(s)&&s===s.trim();
function decode(s){
 if(/&(?!(?:amp|lt|gt|quot|apos);)/.test(s))throw Error('XML_ENTITY_UNSUPPORTED');
 return s.replace(/&(amp|lt|gt|quot|apos);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[k]));
}
// Deliberately limited XML subset: no DTD, external entities, processing instructions, or namespace overrides.
function parseXML(input){
 if(typeof input!=='string'||input.length>MAX)throw Error('XML_SIZE');
 const xml=input.replace(/^\uFEFF/,'').replace(/^\s*<\?xml\s+[^?]*\?>/,'');
 const re=/<\!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/[A-Za-z_][\w:.-]*\s*>|<[A-Za-z_][\w:.-]*(?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>|[^<]+/gy;
 const stack=[],root={children:[],text:''};let count=0,pos=0;
 while(pos<xml.length){
  re.lastIndex=pos;const m=re.exec(xml);if(!m||m.index!==pos)throw Error('XML_UNSUPPORTED');
  const s=m[0];pos=re.lastIndex;const parent=stack.at(-1)||root;
  if(s.startsWith('<!--'))continue;
  if(s.startsWith('<![CDATA[')){parent.text+=s.slice(9,-3);continue}
  if(s.startsWith('</')){if(!stack.length||stack.pop().name!==s.slice(2,-1).trim())throw Error('XML_MISMATCH');continue}
  if(s.startsWith('<')){
   if(++count>4096||stack.length>=16)throw Error('XML_COMPLEXITY');
   const name=/^<([A-Za-z_][\w:.-]*)/.exec(s)[1],attrs=Object.create(null);
   for(const a of s.slice(name.length+1).matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){
    if(Object.hasOwn(attrs,a[1])||a[1]==='xml:base'||(stack.length&&a[1]==='xmlns'))throw Error('XML_ATTRIBUTE');
    attrs[a[1]]=decode(a[2]??a[3]);
   }
   const node={name,attrs,children:[],text:''};parent.children.push(node);
   if(!s.endsWith('/>'))stack.push(node);
  }else parent.text+=decode(s);
 }
 if(stack.length||root.children.length!==1||root.text.trim())throw Error('XML_ROOT');
 return root.children[0];
}
const children=(n,name)=>n.children.filter(c=>c.name===name);
function one(n,name){const a=children(n,name);if(a.length!==1)throw Error('XML_REQUIRED_FIELD');return a[0]}
function textOnly(n){if(n.children.length)throw Error('XML_MARKUP_FIELD');return n.text.trim()}
export function parseNewsXML(xml,format){
 const root=parseXML(xml);
 let rows;
 if(format==='RSS'){
  if(root.name!=='rss'||root.attrs.version!=='2.0'||root.attrs.xmlns)throw Error('RSS_ROOT');
  rows=children(one(root,'channel'),'item').map(n=>({title:textOnly(one(n,'title')),url:textOnly(one(n,'link'))}));
 }else if(format==='ATOM'){
  if(root.name!=='feed'||root.attrs.xmlns!==atomNS)throw Error('ATOM_ROOT');
  rows=children(root,'entry').map(n=>{
   const links=children(n,'link').filter(l=>!l.attrs.rel||l.attrs.rel==='alternate');
   if(links.length!==1||!links[0].attrs.href)throw Error('ATOM_LINK');
   return {title:textOnly(one(n,'title')),url:links[0].attrs.href};
  });
 }else throw Error('SOURCE_FORMAT');
 if(rows.length>30)throw Error('SOURCE_ITEM_LIMIT');
 return rows;
}
async function idFor(kind,key){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(key)));
 return kind+'_'+Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
function configFor(env,agent){
 const format=env[agent+'_SOURCE_FORMAT'],kind=agent==='TPW1'?'news':'device';
 const endpoint=env[agent+'_FEED_URL'],host=env[agent+'_FEED_HOST'],sourceHost=env[agent+'_SOURCE_HOST'],publisher=env[agent+'_SOURCE_PUBLISHER'],brand=env[agent+'_SOURCE_BRAND'];
 if(!['TPW1','TPW3'].includes(agent)||!(kind==='news'?['RSS','ATOM','NEWS_API']:['DEVICE_API']).includes(format)||!clean(publisher)||publisher.length<2||publisher.length>100||!clean(sourceHost)||!sourceHost)throw Error('SOURCE_CONFIG');
 if(kind==='device'&&(!clean(brand)||brand.length<2||brand.length>50))throw Error('SOURCE_BRAND');
 assertTrustedEndpoint(endpoint,endpoint,host);
 assertTrustedEndpoint('https://'+sourceHost+'/','https://'+sourceHost+'/',sourceHost);
 return {format,kind,endpoint,host,sourceHost,publisher,brand};
}
export async function readOfficialSource(env,agent,fetcher=fetch,now=Date.now()){
 const cfg=configFor(env,agent);
 if(!Number.isSafeInteger(now))throw Error('SOURCE_CLOCK');
 const xml=cfg.format==='RSS'||cfg.format==='ATOM';
 const mime=xml?['application/rss+xml','application/atom+xml','application/xml','text/xml']:['application/json'];
 const res=await fetcher(cfg.endpoint,{method:'GET',redirect:'error',headers:{Accept:mime.join(', ')}});
 if(!res.ok||res.redirected||(res.url&&res.url!==cfg.endpoint)||!mime.includes(res.headers.get('content-type')?.split(';')[0].trim().toLowerCase()))throw Error('SOURCE_HTTP');
 const raw=await boundedResponseText(res,MAX);
 let rows;
 if(xml)rows=parseNewsXML(raw,cfg.format);
 else{const doc=JSON.parse(raw);if(!exact(doc,['items'])||!Array.isArray(doc.items))throw Error('SOURCE_API_CONTRACT');rows=doc.items}
 if(rows.length>30)throw Error('SOURCE_ITEM_LIMIT');
 const items=[];
 for(const x of rows){
  if(!exact(x,cfg.kind==='news'?['title','url']:['title','url','device'])||!clean(x.title)||!clean(x.url))throw Error('SOURCE_ROW');
  assertTrustedEndpoint(x.url,x.url,cfg.sourceHost);
  const url=x.url;
  // Source identity is pinned by operator configuration, never accepted from feed claims.
  const out={kind:cfg.kind,source:{url,publisher:cfg.publisher,rights:'LINK_ONLY',type:'PRIMARY'},observedAt:new Date(now).toISOString(),title:x.title};
  if(cfg.kind==='device'){
   const d=x.device;
   if(!exact(d,['brand','model','sku','region'])||d.brand!==cfg.brand||!clean(d.model)||!clean(d.sku)||!clean(d.region))throw Error('SOURCE_DEVICE_VARIANT');
   out.device={brand:d.brand,model:d.model,sku:d.sku,region:d.region};
  }
  out.id=await idFor(cfg.kind,cfg.kind==='news'?[url]:[out.device.brand,out.device.sku,out.device.region]);
  items.push(out);
 }
 const result=prefilterFeed({items},cfg.kind);
 if(result.stats.rejected)throw Error('SOURCE_CANDIDATE_INVALID');
 return result;
}
