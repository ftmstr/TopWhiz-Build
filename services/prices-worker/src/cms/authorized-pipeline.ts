/**
 * Single-entry, authorized CMS review pipeline:
 * draft intake -> external verified evidence -> reviewer grant -> publication
 * -> durable outbox -> best-effort Queue relay. No model can approve itself.
 */
import type { Pool } from "pg";
import { CmsRepository } from "./repository";
import { independentlyAuthorizeRevision } from "./independent-verifier";
import { dispatchCmsOutbox } from "./cloudflare-adapters.mjs";

export function createCmsAuthorizedPipeline(pool:Pool,queue:{send(msg:unknown):Promise<void>}, now:()=>Date=()=>new Date()){
  const repository=new CmsRepository(pool);
  return {
    repository,
    async process(id:string,revision:number){
      const review=await independentlyAuthorizeRevision(pool,id,revision,now());
      if(!review.approved)return {state:"pending_review",reason:review.reason,published:false};
      const result=await repository.publish(id,revision,now());
      if(result.state!=="published")return {state:"quarantined",published:false,reason:"publish_policy_rejected"};
      try{
        const sent=await dispatchCmsOutbox(repository,queue);
        return {state:"published",version:result.version,published:true,
          cacheDelivery:"accepted_by_queue",eventsAccepted:sent.delivered};
      }catch{
        // The content and event were COMMITTED atomically; never claim CDN purge.
        return {state:"published",version:result.version,published:true,
          cacheDelivery:"pending_retry",eventsAccepted:0};
      }
    },
    async submitAndProcess(externalKey:string,payload:Parameters<CmsRepository["submit"]>[1]){
      const draft=await repository.submit(externalKey,payload);
      const result=await this.process(draft.id,draft.revision);
      return {id:draft.id,revision:draft.revision,replayed:draft.replay,...result};
    },
    async relayPending(){
      return dispatchCmsOutbox(repository,queue);
    }
  };
}
