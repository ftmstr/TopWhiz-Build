/**
 * Durable idempotency and lease for at-least-once Cloudflare Queue purges.
 * Execute as isolated queue consumer role, no CMS source/draft privileges.
 * Both node-postgres test and Neon HTTP production share SQL verbatim.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const claimReceiptSql=String.raw`INSERT INTO cms_purge_receipts(event_id,status,claim_token,lease_until,attempts)
 VALUES($1,'processing',$2,now()+interval '2 minutes',1)
 ON CONFLICT(event_id) DO UPDATE
 SET status='processing',claim_token=EXCLUDED.claim_token,
     lease_until=EXCLUDED.lease_until,attempts=cms_purge_receipts.attempts+1
 WHERE cms_purge_receipts.status='processing'
   AND cms_purge_receipts.lease_until<now()
 RETURNING claim_token`;
export const receiptStatusSql="SELECT status FROM cms_purge_receipts WHERE event_id=$1";
export const finishReceiptSql=String.raw`UPDATE cms_purge_receipts SET status='completed',completed_at=now()
 WHERE event_id=$1 AND claim_token=$2 AND status='processing' RETURNING event_id`;
export const releaseReceiptSql=String.raw`UPDATE cms_purge_receipts SET lease_until=now()-interval '1 second'
 WHERE event_id=$1 AND claim_token=$2 AND status='processing'`;
export function makeReceiptStore(query){
  if(typeof query!=="function")throw Error("receipt_database_required");
  return {
    async claim(eventId){
      if(!UUID.test(eventId??""))throw Error("invalid_event_id");
      const token=crypto.randomUUID();
      const acquired=await query(claimReceiptSql,[eventId,token]);
      if(acquired.length===1)return {status:"acquired",token};
      const saved=await query(receiptStatusSql,[eventId]);
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
