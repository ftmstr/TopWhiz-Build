import {validPngStructure} from "./png-structure.mjs";
/**
 * Controlled, read-only publication of R2 image bytes.
 * The media lookup MUST independently verify approval AND current published
 * content use. Object presence, a guessed asset ID, or model claims are not enough.
 */
const ID=/^[a-z0-9][a-z0-9_-]{0,95}$/;
const HASH=/^[a-f0-9]{64}$/;
const MIME_EXT=new Map([["image/png","png"],["image/jpeg","jpg"],["image/webp","webp"]]);
function answer(status){
  return new Response(null,{status,headers:{
    "Cache-Control":"no-store","CDN-Cache-Control":"no-store","Cloudflare-CDN-Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer"
  }});
}

/**
 * TUR071 opt-in cancellation. The deployed Worker does NOT supply abortSignal;
 * a real HTTP transport adapter must explicitly bridge connection loss to it.
 * This cancels an in-flight ReadableStream read, not bytes already sent, nor an
 * in-progress PostgreSQL query if its driver ignores AbortSignal.
 */
function failIfAborted(signal){
  if(signal?.aborted)throw Error("cms_request_aborted");
}
function readWithAbort(reader,signal){
  if(!signal)return reader.read();
  failIfAborted(signal);
  return new Promise((resolve,reject)=>{
    let settled=false;
    function finish(fn,value){
      if(settled)return;
      settled=true;signal.removeEventListener("abort",onAbort);fn(value);
    }
    function onAbort(){
      // Do not await source cancel here: an underlying asynchronous R2 pull
      // may be stalled, and client disconnect must not hang the handler.
      Promise.resolve().then(()=>reader.cancel("cms_request_aborted")).catch(()=>{});
      finish(reject,Error("cms_request_aborted"));
    }
    signal.addEventListener("abort",onAbort,{once:true});
    if(signal.aborted){onAbort();return}
    reader.read().then(v=>finish(resolve,v),e=>finish(reject,e));
  });
}

async function verifiedBytes(stream,expectedBytes,expectedHash,expectedMime,abortSignal){
  if(!stream || typeof stream.getReader!=="function")throw Error("missing_image_body");
  const reader=stream.getReader();
  const parts=[];let total=0;
  try{
    while(true){
      const {done,value}=await readWithAbort(reader,abortSignal);
      if(done)break;
      if(!(value instanceof Uint8Array))throw Error("invalid_stream_chunk");
      total+=value.byteLength;
      if(total>expectedBytes || total>10485760)throw Error("media_bytes_exceeded");
      parts.push(value);
    }
  }catch(e){
    try{
      const cancelled=reader.cancel("cms_media_verify_failed");
      if(abortSignal?.aborted)void cancelled.catch(()=>{});
      else await cancelled;
    }catch{}
    throw e;
  }
  finally{reader.releaseLock()}
  failIfAborted(abortSignal);
  if(total!==expectedBytes)throw Error("media_length_mismatch");
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of parts){bytes.set(chunk,offset);offset+=chunk.length}
  const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  const jpg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&
    String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if(!((expectedMime==="image/png"&&png)||(expectedMime==="image/jpeg"&&jpg)||
     (expectedMime==="image/webp"&&webp)))throw Error("media_signature_mismatch");
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  const hex=[...digest].map(v=>v.toString(16).padStart(2,"0")).join("");
  if(hex!==expectedHash)throw Error("media_digest_mismatch");
  if(expectedMime==="image/png"&&!validPngStructure(bytes))throw Error("media_png_structure_invalid");
  if(expectedMime==="image/jpeg"&&(bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217))throw Error("media_jpeg_termination_invalid");
  if(expectedMime==="image/webp"&&(new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)).getUint32(4,true)+8!==bytes.length)throw Error("media_webp_length_invalid");
  failIfAborted(abortSignal);
  return bytes;
}

export async function handleCmsMedia(request,{findApprovedAsset,bucket,abortSignal}={}){
  const url=new URL(request.url);
  if(request.method!=="GET" && request.method!=="HEAD")return answer(405);
  if(url.search||url.hash)return answer(400);
  const match=/^\/v1\/media\/([a-z0-9_-]{1,96})$/.exec(url.pathname);
  if(!match||!ID.test(match[1]))return answer(404);
  if(typeof findApprovedAsset!=="function"||!bucket||typeof bucket.get!=="function")return answer(503);
  try{
    failIfAborted(abortSignal);
    const asset=await findApprovedAsset(match[1],abortSignal);
    failIfAborted(abortSignal);
    const extension=MIME_EXT.get(asset?.contentType);
    if(!asset||asset.rightsApproved!==true||!extension||
       !HASH.test(asset.sha256Hex??"")||
       !Number.isInteger(asset.bytes)||asset.bytes<12||asset.bytes>10485760||
       !asset.key ||asset.key!==
         "media/reviewed/"+match[1]+"/"+asset.sha256Hex+"."+extension) return answer(404);
    const image=await bucket.get(asset.key);
    failIfAborted(abortSignal);
    if(!image)return answer(404);
    if(image.size!==asset.bytes||
       image.customMetadata?.sha256!==asset.sha256Hex||
       image.httpMetadata?.contentType!==asset.contentType)return answer(503);
    // R2 metadata is NOT proof that object bytes were not tampered with.
    // Read with strict size cap, validate signature and re-hash all bytes.
    const verified=await verifiedBytes(image.body,asset.bytes,asset.sha256Hex,asset.contentType,abortSignal);
    failIfAborted(abortSignal);
    // Narrow TOCTOU window: rights or public usage may be revoked while an
    // R2 stream is being verified. Re-query the security-barrier media view
    // before sending ANY bytes. The final response remains no-store.
    const latest=await findApprovedAsset(match[1],abortSignal);
    failIfAborted(abortSignal);
    if(!latest||latest.rightsApproved!==true||
       latest.key!==asset.key||latest.sha256Hex!==asset.sha256Hex||
       latest.contentType!==asset.contentType||latest.bytes!==asset.bytes)
       return answer(404);
    const headers={
      "Content-Type":asset.contentType,
      "Content-Length":String(image.size),
      "Cache-Control":"no-store",
      "CDN-Cache-Control":"no-store",
      "Cloudflare-CDN-Cache-Control":"no-store",
      "Content-Disposition":"inline",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
      "Content-Security-Policy":"default-src 'none'; sandbox"
    };
    failIfAborted(abortSignal);
    return new Response(request.method==="HEAD"?null:verified,{status:200,headers});
  }catch{return answer(503)}
}
