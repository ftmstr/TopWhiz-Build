/**
 * TOPWHIZ TUR019 - CI-ONLY, SINGLE-PROCESS publication fence prototype.
 *
 * This is deliberately NOT a Cloudflare/R2 production middleware.
 * No shared Cloudflare isolate lock, distributed DB transaction, network
 * last-byte acknowledgement or legacy CDN eviction is implemented here.
 *
 * Contract within ONE JS event loop, when EVERY media response and EVERY
 * rights mutation uses this SAME instance:
 *  - serve() acquires a read permit BEFORE the first rights DB lookup.
 *  - revoke() synchronously closes admissions, waits for all response bodies
 *    to be consumed/cancelled (JS stream lifecycle), THEN commits withdrawal.
 *  - after revocation resolves, no prior enrolled response remains active.
 *  - failed/ambiguous withdrawal leaves the asset QUARANTINED, not re-opened.
 *  - release uses a 0-high-watermark stream and a single-shot terminal flag.
 *
 * A stalled/unconsumed response can block revoke indefinitely. No automatic
 * timeout is silently treated as last-byte proof. Callers must cancel streams
 * and use a real distributed cancellation/acknowledgement design before use.
 */
const ASSET=/^[a-z0-9][a-z0-9_-]{0,95}$/;
function denied(status){
 return new Response(null,{status,headers:{
  "Cache-Control":"no-store","CDN-Cache-Control":"no-store",
  "Cloudflare-CDN-Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"
 }});
}
export function createLocalMediaPublicationFence(){
 const states=new Map();
 function stateFor(id){
  if(typeof id!=="string"||!ASSET.test(id))throw Error("invalid_media_fence_asset");
  let state=states.get(id);
  if(!state){state={phase:"open",active:0,waiters:[],revocation:null};states.set(id,state)}
  return state;
 }
 function release(state){
  state.active--;
  if(state.active<0)throw Error("media_fence_permit_underflow");
  if(state.active===0){
   for(const wake of state.waiters.splice(0))wake();
  }
 }
 return Object.freeze({
  async serve(assetId,build){
   const state=stateFor(assetId);
   if(typeof build!=="function")throw Error("media_fence_builder_required");
   if(state.phase!=="open")
    return denied(state.phase==="revoked"?404:503);
   state.active++;
   let released=false;
   const finish=()=>{if(!released){released=true;release(state)}};
   try{
    const original=await build();
    if(!(original instanceof Response))throw Error("media_fence_response_required");
    if(!/\bno-store\b/i.test(original.headers.get("cache-control")??""))
      throw Error("media_fence_no_store_required");
    if(original.status!==200||!original.body){
     finish();
     return original;
    }
    const source=original.body.getReader();
    const stream=new ReadableStream({
     async pull(controller){
      if(released){controller.close();return}
      try{
       const item=await source.read();
       if(item.done){controller.close();finish()}
       else controller.enqueue(item.value);
      }catch(error){
       controller.error(error);
       try{await source.cancel(error)}catch{}
       finish();
      }
     },
     async cancel(reason){
      try{await source.cancel(reason)}finally{finish()}
     }
    },{highWaterMark:0});
    return new Response(stream,{
     status:200,statusText:original.statusText,headers:original.headers
    });
   }catch{
    finish();
    return denied(503);
   }
  },
  async revoke(assetId,commitWithdrawal){
   const state=stateFor(assetId);
   if(typeof commitWithdrawal!=="function")
    throw Error("media_fence_mutation_required");
   if(state.phase==="revoked")return {status:"revoked"};
   if(state.phase==="quarantined")
    throw Error("media_fence_ambiguous_commit_quarantined");
   if(state.phase==="revoking")return state.revocation;
   // This assignment MUST precede the first await; new readers fail closed.
   state.phase="revoking";
   state.revocation=(async()=>{
    if(state.active>0){
     await new Promise(resolve=>state.waiters.push(resolve));
    }
    try{
     await commitWithdrawal();
     state.phase="revoked";
     return {status:"revoked"};
    }catch(error){
     // A lost COMMIT response may mean database committed withdrawal:
     // never auto-restore visibility after ambiguous mutation.
     state.phase="quarantined";
     throw error;
    }
   })();
   return state.revocation;
  },
  inspectForTest(assetId){
   const s=stateFor(assetId);
   return Object.freeze({phase:s.phase,active:s.active});
  }
 });
}
