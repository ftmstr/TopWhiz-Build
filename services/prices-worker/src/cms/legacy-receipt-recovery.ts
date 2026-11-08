/**
 * TUR014 operator-only recovery of a PRE-TUR013 completed purge receipt
 * whose event_sha256 is NULL. A historical 'completed' marker alone never
 * proves which routes Cloudflare actually purged.
 *
 * This code is intentionally NOT mounted in any public API/Worker.
 * It requires a separately authenticated, independently approved operator,
 * the ORIGINAL immutable outbox event and a dedicated least-privilege SQL
 * SECURITY DEFINER claim. Queue sends may be repeated; DLQ ACK is only
 * allowed AFTER both Queue acceptance and the SQL transaction commit.
 */
import type {Pool} from "pg";
import {validatePurgeEvent,fingerprintPurgeEvent} from "./cloudflare-adapters.mjs";

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
type OutboxRow={
 id:string;submission_id:string;revision_no:number;
 event_kind:"published"|"withdrawn";routes:string[];
};
type IndependentApproval={approved:boolean;ticket:string;operator:string};
interface RecoveryPort{
 verifyOperatorTicket:(event:{eventId:string;submissionId:string;revision:number;kind:string})=>Promise<IndependentApproval>;
 auditReplay:(event:{eventId:string;operator:string;ticket:string;outcome:string})=>Promise<void>;
 originQueue:{send:(event:unknown)=>Promise<void>};
}
export async function authorizeLegacyReceiptRedrive(
 pool:Pool,eventId:string,ports:RecoveryPort
){
 if(!UUID.test(eventId??"")||typeof ports?.verifyOperatorTicket!=="function"||
    typeof ports?.auditReplay!=="function"||typeof ports?.originQueue?.send!=="function")
   throw Error("legacy_recovery_requires_authenticated_operator_audit_queue");
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  // Read the immutable original authoritative ledger, NEVER accept
  // routes/approvals supplied by Queue, DLQ or a human request body.
  const row=(await c.query<OutboxRow>(
   "SELECT id,submission_id,revision_no,event_kind,routes FROM cms_delivery_outbox WHERE id=$1",
   [eventId])).rows[0];
  if(!row)throw Error("legacy_recovery_event_not_durable");
  const event=validatePurgeEvent({
   eventId:row.id,submissionId:row.submission_id,
   revision:row.revision_no,kind:row.event_kind,routes:row.routes
  });
  const prior=(await c.query<{status:string;event_sha256:string|null}>(
   "SELECT status,event_sha256 FROM cms_purge_receipts WHERE event_id=$1 FOR UPDATE",
   [eventId])).rows[0];
  if(!prior||prior.status!=="completed"||prior.event_sha256!==null)
   throw Error("legacy_recovery_receipt_not_eligible");
  const approval=await ports.verifyOperatorTicket({
   eventId:event.eventId,submissionId:event.submissionId,
   revision:event.revision,kind:event.kind
  });
  if(approval?.approved!==true||typeof approval?.ticket!=="string"||
     approval.ticket.trim().length<8||approval.ticket.length>240||
     typeof approval?.operator!=="string"||
     approval.operator.trim().length<3||approval.operator.length>120)
    throw Error("legacy_recovery_independent_approval_denied");
  const digest=await fingerprintPurgeEvent(event);
  // Independent immutable external audit MUST succeed before any send.
  await ports.auditReplay({
   eventId,operator:approval.operator,ticket:approval.ticket,
   outcome:"legacy_completed_receipt_forced_repurge"
  });
  const claimed=await c.query<{approved:boolean}>(
   "SELECT cms_claim_legacy_redrive($1::uuid,$2::varchar,$3::varchar,$4::varchar) AS approved",
   [eventId,digest,approval.operator,approval.ticket]);
  if(claimed.rows[0]?.approved!==true)throw Error("legacy_recovery_sql_claim_denied");
  // Send before COMMIT: if sending fails the one-time SQL deletion+audit
  // roll back. If COMMIT itself fails, caller MUST NOT ACK the DLQ event.
  // Queue could still have received an at-least-once duplicate; safe retry.
  await ports.originQueue.send(event);
  await c.query("COMMIT");
  return {eventId,canonicalDigest:digest,queued:true,
    receiptReset:true,acknowledgeDlq:true};
 }catch(error){await c.query("ROLLBACK");throw error}
 finally{c.release()}
}
