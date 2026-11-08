/**
 * Operational DLQ redrive, NOT a deployed consumer.
 * Requires an external independently verified operator ticket on each item.
 * At-least-once original Queue redelivery stays protected by durable receipts.
 */
import {validatePurgeEvent} from "./cloudflare-adapters.mjs";
export async function replayDeadLetters(batch,{
  verifyOperatorTicket,originQueue,receipts,auditReplay
}={}){
  if(typeof verifyOperatorTicket!=="function"||
     typeof originQueue?.send!=="function"||
     typeof receipts?.status!=="function"||
     typeof auditReplay!=="function")
    throw Error("dlq_requires_authenticated_operator_and_audit");
  if(!batch||!Array.isArray(batch.messages)||batch.messages.length>10)
    throw Error("dlq_batch_limit");
  const seen=new Set();
  const stats={resent:0,previouslyCompleted:0,retried:0};
  for(const msg of batch.messages){
    try{
      const event=validatePurgeEvent(msg.body);
      if(seen.has(event.eventId)){
        msg.retry({delaySeconds:30});
        stats.retried++;
        continue;
      }
      seen.add(event.eventId);
      // Never trust the message body's self-reported approval fields.
      const approval=await verifyOperatorTicket({
        eventId:event.eventId,submissionId:event.submissionId,
        revision:event.revision,kind:event.kind
      });
      if(approval?.approved!==true ||
         typeof approval.ticket!=="string"||approval.ticket.length<8 ||
         typeof approval.operator!=="string"||approval.operator.length<3)
        throw Error("dlq_operator_ticket_denied");
      const state=await receipts.status(event.eventId);
      if(state==="completed"){
        await auditReplay({eventId:event.eventId,ticket:approval.ticket,
          operator:approval.operator,outcome:"already_completed"});
        msg.ack();stats.previouslyCompleted++;continue;
      }
      if(state==="processing")throw Error("dlq_event_claim_still_processing");
      // Audit the replay action BEFORE sending. Audit failure means NO send.
      await auditReplay({eventId:event.eventId,ticket:approval.ticket,
        operator:approval.operator,outcome:"resend_requested"});
      await originQueue.send(event);
      msg.ack();
      stats.resent++;
    }catch{
      // Failed audit, denied ticket, bad payload, Queue offline, active lease
      // never result in an ack. Operator monitors the DLQ for manual decision.
      msg.retry({delaySeconds:60});
      stats.retried++;
    }
  }
  return stats;
}
