import {validPngStructure} from "./png-structure.mjs";
/**
 * Cloudflare Queue/R2 and zone-purge adapters. No bindings or credentials in Git.
 * Queue delivery is at-least-once; retry/purge is idempotent.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID=/^[a-z0-9][a-z0-9_-]{0,95}$/;
const SAFE_ROUTES=/^\/$|^\/haberler(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$|^\/telefonlar(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$|^\/karsilastir$/;

export function validatePurgeEvent(event){
  if(!event||!UUID.test(event.eventId??"")||!UUID.test(event.submissionId??"")||
     !Number.isInteger(event.revision)||event.revision<1||
     !["published","withdrawn"].includes(event.kind)||
     !Array.isArray(event.routes)||event.routes.length>10||
     event.routes.some(route=>typeof route!=="string"||route.length>255||!SAFE_ROUTES.test(route)))
    throw Error("invalid_cache_event");
  // Contract-only redelivery: never forward forged "approved", "ticket",
  // arbitrary token or path fields from untrusted Queue/DLQ payloads.
  return {eventId:event.eventId,submissionId:event.submissionId,
    revision:event.revision,kind:event.kind,routes:[...new Set(event.routes)]};
}
/** Mark delivered ONLY after Queue accepted event; failed sends remain pending. */
export async function dispatchCmsOutbox(repository,queue,limit=20){
  if(!repository||!queue||typeof queue.send!=="function")throw Error("queue_binding_required");
  const events=await repository.pendingOutbox(limit);
  let delivered=0;
  for(const event of events){
    const message=validatePurgeEvent({
      eventId:event.id,submissionId:event.submission_id,
      revision:event.revision_no,kind:event.event_kind,routes:event.routes
    });
    await queue.send(message);
    await repository.markDelivered(event.id);
    delivered++;
  }
  return {delivered};
}
/** Queue handler: acknowledge success; let Cloudflare retry transient failures. */
export async function consumeCmsPurgeBatch(batch,purger,receipts){
  for(const msg of batch.messages){
    let claim=null, event=null;
    try{
      event=validatePurgeEvent(msg.body);
      if(receipts){
        claim=await receipts.claim(event.eventId);
        if(claim.status==="completed"){msg.ack();continue}
        if(claim.status!=="acquired"){
          msg.retry({delaySeconds:30});continue;
        }
      }
      await purger(event.routes);
      if(receipts)await receipts.complete(event.eventId,claim.token);
      msg.ack();
    }catch{
      if(receipts&&claim?.status==="acquired"&&event){
        try{await receipts.release(event.eventId,claim.token)}catch{/* retry safely */}
      }
      // Cloudflare max_retries routes permanently failing messages to
      // configured DLQ. Nothing is silently acknowledged as success.
      const attempts=Number.isInteger(msg.attempts)?msg.attempts:1;
      msg.retry({delaySeconds:Math.min(300,5*2**Math.min(6,Math.max(0,attempts-1)))});
    }
  }
}
/** Zone-wide purge; caches.default.delete() alone is only local. */
export function createCloudflareZonePurger({fetcher,zoneId,apiToken,origin}){
  if(!/^[a-f0-9]{32}$/i.test(zoneId??"")||!apiToken||
     typeof fetcher!=="function")throw Error("purge_config_required");
  const site=new URL(origin);
  if(site.protocol!=="https:"||site.username||site.password||
     site.pathname!=="/"||site.search||site.hash)throw Error("invalid_site_origin");
  return async routes=>{
    const all=[...new Set(routes)];
    if(all.length>10||all.some(route=>!SAFE_ROUTES.test(route)))throw Error("invalid_purge_routes");
    if(!all.length)return;
    const files=all.map(route=>new URL(route,site).toString());
    const response=await fetcher(
      "https://api.cloudflare.com/client/v4/zones/"+zoneId+"/purge_cache",{
        method:"POST",
        headers:{"Authorization":"Bearer "+apiToken,"Content-Type":"application/json"},
        body:JSON.stringify({files})
      });
    if(!response.ok)throw Error("cache_purge_http_failure");
    const body=await response.json();
    if(body?.success!==true)throw Error("cache_purge_rejected");
  };
}
function sniff(bytes){
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))
    return {mime:"image/png",extension:"png"};
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)
    return {mime:"image/jpeg",extension:"jpg"};
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&
     String.fromCharCode(...bytes.slice(8,12))==="WEBP")
    return {mime:"image/webp",extension:"webp"};
  throw Error("unsupported_image_signature");
}
/** Stage licensed bytes to R2. No public URL or DB approval is generated. */
export async function stageLicensedMedia(bucket,assetId,buffer,approval){
  if(!bucket||typeof bucket.put!=="function"||!ID.test(assetId??"")||
     approval?.rightsApproved!==true||typeof approval?.evidenceRef!=="string"||
     approval.evidenceRef.trim().length<6||typeof approval?.reviewer!=="string"||
     approval.reviewer.trim().length<3)throw Error("media_license_not_verified");
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(bytes.length<12||bytes.length>10*1024*1024)throw Error("invalid_media_size");
  const {mime,extension}=sniff(bytes);
  if(mime==="image/png"&&!validPngStructure(bytes))throw Error("invalid_png_structure");
  if(mime==="image/jpeg"&&(bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217))throw Error("invalid_jpeg_termination");
  if(mime==="image/webp"&&(new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)).getUint32(4,true)+8!==bytes.length)throw Error("invalid_webp_length");
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  const sha256=[...digest].map(value=>value.toString(16).padStart(2,"0")).join("");
  const key="media/reviewed/"+assetId+"/"+sha256+"."+extension;
  await bucket.put(key,bytes,{
    httpMetadata:{contentType:mime,cacheControl:"private, no-store"},
    customMetadata:{sha256,sourceReview:"verified"}
  });
  return {assetId,key,sha256,contentType:mime,bytes:bytes.length,
    publicationStatus:"staged"};
}


/** Node outbox relay -> official Cloudflare Queues HTTP Push API.
 * Requires QUEUES Write token from secret manager, never committed to Git.
 */
export function createCloudflareQueueSender({fetcher,accountId,queueId,apiToken}){
  if(typeof fetcher!=="function"||!/^[a-f0-9]{32}$/i.test(accountId??"")||
     !/^[a-f0-9]{32}$/i.test(queueId??"")||!apiToken)throw Error("queue_sender_config_required");
  return {async send(message){
    const safe=validatePurgeEvent(message);
    const response=await fetcher(
      "https://api.cloudflare.com/client/v4/accounts/"+accountId+"/queues/"+queueId+"/messages",{
      method:"POST",headers:{"Authorization":"Bearer "+apiToken,"Content-Type":"application/json"},
      body:JSON.stringify({body:safe,content_type:"json"})});
    if(!response.ok)throw Error("queue_http_failure");
    const data=await response.json();
    if(data?.success!==true)throw Error("queue_rejected");
  }};
}
