/**
 * Adapter for a PRIVATE authenticated Node ingress. Not mounted on public Worker.
 * The one ingress stores drafts ONLY; AI cannot send approvals/publish flags.
 */
import { timingSafeEqual } from "node:crypto";
const MAX_BODY_BYTES = 65536;
function response(payload,status){
  return new Response(JSON.stringify(payload),{status,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
  }});
}
function tokenMatch(provided,expected){
  if(typeof expected!=="string"||expected.length<32||typeof provided!=="string")return false;
  const given=Buffer.from(provided,"utf8"),secret=Buffer.from(expected,"utf8");
  return given.length===secret.length&&timingSafeEqual(given,secret);
}
async function readLimitedJson(request){
  const reader=request.body?.getReader();
  if(!reader)throw Error("empty_body");
  let size=0;
  const parts=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BODY_BYTES)throw Error("oversized");
      parts.push(value);
    }
  }finally{reader.releaseLock()}
  const all=new Uint8Array(size);
  let offset=0;
  for(const piece of parts){all.set(piece,offset);offset+=piece.length}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all));
}
export async function handlePrivateCmsIntake(request,{repository,intakeSecret}){
  const url=new URL(request.url);
  if(url.pathname!=="/internal/cms/submit")return response({error:"not_found"},404);
  if(request.method!=="POST")return response({error:"method_not_allowed"},405);
  if(url.protocol!=="https:"||url.search)return response({error:"invalid_transport"},403);
  const provided=request.headers.get("authorization")?.replace(/^Bearer /,"") ?? "";
  if(!tokenMatch(provided,intakeSecret))return response({error:"unauthorized"},401);
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")
    return response({error:"invalid_content_type"},415);
  if(!repository||typeof repository.submit!=="function")return response({error:"service_unavailable"},503);
  try{
    const payload=await readLimitedJson(request);
    if(!payload||typeof payload!=="object"||Array.isArray(payload)||
       Object.keys(payload).sort().join(",")!=="content,externalKey")
      return response({error:"invalid_payload"},400);
    const result=await repository.submit(payload.externalKey,payload.content);
    return response({id:result.id,revision:result.revision,state:result.state,replay:result.replay},202);
  }catch{
    // Deliberately no SQL errors, IDs of other records, token, or uploaded body.
    return response({error:"rejected_or_conflict"},422);
  }
}
