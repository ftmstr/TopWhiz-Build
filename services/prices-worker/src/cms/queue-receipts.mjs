/**
 * Durable idempotency and lease for at-least-once Cloudflare Queue purges.
 * Execute as isolated queue consumer role, no CMS source/draft privileges.
 * Both node-postgres test and Neon HTTP production share SQL verbatim.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const claimReceiptSql=String.raw`INSERT INTO cms_purge_receipts(event_id,status,claim_token,lease_until,attempts,event_sha256)
 VALUES($1,'processing',$2,now()+interval '2 minutes',1,$3)
 ON CONFLICT(event_id) DO UPDATE
 SET status='processing',claim_token=EXCLUDED.claim_token,
     lease_until=EXCLUDED.lease_until,attempts=cms_purge_receipts.attempts+1
 WHERE cms_purge_receipts.status='processing'
   AND cms_purge_receipts.lease_until<now()
   AND cms_purge_receipts.event_sha256 IS NOT DISTINCT FROM EXCLUDED.event_sha256
 RETURNING claim_token`;
export const receiptStatusSql="SELECT status,event_sha256 FROM cms_purge_receipts WHERE event_id=$1";
export const finishReceiptSql=String.raw`UPDATE cms_purge_receipts SET status='completed',completed_at=now()
 WHERE event_id=$1 AND claim_token=$2 AND status='processing' RETURNING event_id`;
export const releaseReceiptSql=String.raw`UPDATE cms_purge_receipts SET lease_until=now()-interval '1 second'
 WHERE event_id=$1 AND claim_token=$2 AND status='processing'`;
const DIGEST=/^[a-f0-9]{64}$/;
function checkDigest(value){
 if(value!==null&&(typeof value!=="string"||!DIGEST.test(value)))throw Error("invalid_receipt_event_digest");
}
export function makeReceiptStore(query){
  if(typeof query!=="function")throw Error("receipt_database_required");
  return {
    /** A Queue message has NO authority to invent an event or change its
     * routes/revision: match every field against the durable publication
     * transaction outbox BEFORE touching Cloudflare's zone cache.
     */
    async verifyEvent(event){
      const id=event?.eventId;
      if(!UUID.test(id??""))throw Error("invalid_event_id");
      const rows=await query(
        "SELECT submission_id,revision_no,event_kind,routes FROM cms_delivery_outbox WHERE id=$1",
        [id]);
      const rec=rows[0];
      return !!rec&&rec.submission_id===event.submissionId&&
        Number(rec.revision_no)===event.revision&&rec.event_kind===event.kind&&
        Array.isArray(rec.routes)&&
        JSON.stringify([...new Set(rec.routes)])===JSON.stringify(event.routes);
    },
    async status(eventId,eventDigest=null){
      if(!UUID.test(eventId??""))throw Error("invalid_event_id");
      checkDigest(eventDigest);
      const saved=await query(receiptStatusSql,[eventId]);
      // Legacy pre-TUR013 rows have no event hash. Reconciliation cannot
      // assert payload identity for them; deployments MUST inventory/retire
      // outstanding legacy DLQ messages before strict rollout.
      if(eventDigest!==null&&saved[0]?.event_sha256!=null&&
         saved[0].event_sha256!==eventDigest)throw Error("receipt_event_hash_mismatch");
      return saved[0]?.status??"missing";
    },
    async claim(eventId,eventDigest=null){
      if(!UUID.test(eventId??""))throw Error("invalid_event_id");
      checkDigest(eventDigest);
      const token=crypto.randomUUID();
      const acquired=await query(claimReceiptSql,[eventId,token,eventDigest]);
      if(acquired.length===1)return {status:"acquired",token};
      const saved=await query(receiptStatusSql,[eventId]);
      if(saved[0]&&saved[0].event_sha256!==eventDigest)
        throw Error("receipt_event_hash_mismatch");
      return {status:saved[0]?.status==="completed"?"completed":"busy"};
    },
    async complete(eventId,token){
      if(!UUID.test(eventId??"")||!UUID.test(token??""))throw Error("invalid_receipt_token");
      const updated=await query(finishReceiptSql,[eventId,token]);
      if(updated.length!==1)throw Error("lost_receipt_lease");
    },
    async release(eventId,token){
      if(!UUID.test(eventId??"")||!UUID.test(token??""))return;
      await query(releaseReceiptSql,[eventId,token]);
    }
  };
}
export async function createNeonReceiptStore(databaseUrl){
  if(typeof databaseUrl!=="string"||!/^postgres(ql)?:\/\//.test(databaseUrl))
    throw Error("receipt_database_required");
  const {neon}=await import("@neondatabase/serverless");
  const sql=neon(databaseUrl);
  return makeReceiptStore((statement,args)=>sql.query(statement,args));
}
