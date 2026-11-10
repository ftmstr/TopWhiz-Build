import { NextRequest } from "next/server";

const VALID_ID=/^[a-z0-9][a-z0-9_-]{0,95}$/;
const ACCEPTED_MIME=new Set(["image/png","image/jpeg","image/webp"]);
const MAX_BYTES=10485760;
function unavailable(status:number){return new Response(null,{status,headers:{
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
}})}
function safeOrigin():string|null{
  const supplied=process.env.TOPWHIZ_CMS_API_BASE;
  const permittedHost=process.env.TOPWHIZ_CMS_API_HOST;
  try{
    if(!supplied||!permittedHost)return null;
    const u=new URL(supplied);
    if(u.protocol!=="https:"||u.hostname!==permittedHost||u.username||
       u.password||u.port||u.pathname!=="/"||u.search||u.hash)return null;
    return u.origin;
  }catch{return null}
}

/** Server-only, same-origin image proxy. Never accepts arbitrary remote URLs. */
export async function GET(request:NextRequest,{params}:{
  params:Promise<{id:string}>
}){
  const {id}=await params;
  if(!VALID_ID.test(id))return unavailable(404);
  const base=safeOrigin();
  if(!base)return unavailable(503);
  // TUR073: bound, composable cancellation. The deployed Next runtime must
  // actually signal connection loss for this to abort in-flight work: that
  // transport-to-Request.signal bridge is NOT proven by a unit test.
  const requestSignal=AbortSignal.any([request.signal,AbortSignal.timeout(6000)]);
  if(requestSignal.aborted)return unavailable(503);
  try{
    const response=await fetch(base+"/v1/media/"+id,{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{"Accept":"image/png, image/jpeg, image/webp"},
      signal:requestSignal
    });
    if(requestSignal.aborted){
      if(response.body)await response.body.cancel().catch(()=>{});
      return unavailable(503);
    }
    if(!response.ok || !response.body) return unavailable(response.status===404?404:503);
    const mime=response.headers.get("content-type")?.split(";")[0].trim();
    const byteCount=Number(response.headers.get("content-length"));
    if(!mime||!ACCEPTED_MIME.has(mime)||!Number.isSafeInteger(byteCount)||
       byteCount<12||byteCount>MAX_BYTES){
      await response.body.cancel();return unavailable(503)
    }
    if(requestSignal.aborted){await response.body.cancel().catch(()=>{});return unavailable(503)}
    return new Response(response.body,{status:200,headers:{
      "Content-Type":mime,
      "Content-Length":String(byteCount),
      "Cache-Control":"no-store",
      "Content-Disposition":"inline",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
      "Content-Security-Policy":"default-src 'none'; sandbox"
    }});
  }catch{return unavailable(503)}
}
export const dynamic="force-dynamic";
