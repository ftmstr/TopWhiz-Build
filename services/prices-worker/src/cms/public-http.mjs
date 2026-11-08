/**
 * Public HTTP contract for CMS list/detail queries. Reader injection permits
 * real PostgreSQL tests without a deployed Cloudflare Worker or fake prices.
 */
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control":"no-store",
    "Cloudflare-CDN-Cache-Control":"no-store",
    "Vary":"Accept",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer"
  }});
}
export async function handlePublicCmsRequest(request,readContent){
  if(request.method!=="GET")return json({error:"method_not_allowed"},405);
  const url=new URL(request.url);
  const parts=url.pathname.split("/").filter(Boolean);
  const listing=parts.length===2&&parts[0]==="v1"&&parts[1]==="content";
  const detail=parts.length===4&&parts[0]==="v1"&&parts[1]==="content";
  const type=listing?url.searchParams.get("type"):detail?parts[2]:null;
  const slug=detail?parts[3]:undefined;
  if(!["news","phone"].includes(type??"")||
     (listing&&(url.searchParams.size!==1||url.searchParams.getAll("type").length!==1))||
     (detail&&(url.searchParams.size!==0||!slug||slug.length>100||!SLUG.test(slug)))||
     (!listing&&!detail))return json({error:"invalid_content_query"},400);
  if(typeof readContent!=="function")return json({status:"not_configured",items:[]},503);
  try{
    const result=await readContent(type,slug);
    if(detail&&!result)return json({error:"not_found"},404);
    return listing?json({status:"ok",items:result}):json({status:"ok",item:result});
  }catch{return json({status:"temporarily_unavailable",items:[]},503)}
}
