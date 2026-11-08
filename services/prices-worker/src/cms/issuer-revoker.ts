/**
 * Internal issuer authority revocation + repair of asynchronously changed
 * key/evidence state. Never mounted on the public Worker or AI intake.
 * Any revoked/rotated signing key makes cms_public_pages deny immediately.
 */
import type {Pool,PoolClient} from "pg";
const ID=/^[a-zA-Z0-9._:-]{1,120}$/;
const ROUTE=/^\/$|^\/haberler(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$|^\/telefonlar(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$|^\/karsilastir$/;
type Impact={id:string;revision_no:number};
const invalidIssuer=String.raw`SELECT s.id,s.revision_no
 FROM content_submissions s
 JOIN LATERAL(
   SELECT v.version FROM published_content_versions v
   WHERE v.submission_id=s.id ORDER BY v.version DESC LIMIT 1
 ) pub ON true
 WHERE s.state='published' AND EXISTS(
   SELECT 1 FROM cms_public_issuer_dependencies dep
   LEFT JOIN cms_review_authorities auth ON auth.id=dep.authority_id
   LEFT JOIN cms_external_attestations evidence
     ON evidence.submission_id=dep.submission_id AND evidence.revision_no=dep.version
       AND evidence.attestation_type=dep.attestation_type
       AND evidence.authority_id=dep.authority_id
   WHERE dep.submission_id=s.id AND dep.version=pub.version
     AND (auth.active IS DISTINCT FROM true OR
          auth.public_key_pem IS DISTINCT FROM dep.approved_public_key OR
          evidence.status IS DISTINCT FROM 'verified' OR
          evidence.signature_base64 IS NULL)
 ) ORDER BY s.id LIMIT $1 FOR UPDATE OF s`;
async function withdrawUnderLock(c:PoolClient,rows:Impact[]){
 let removed=0;
 for(const {id,revision_no} of rows){
   const routes=(await c.query<{public_path:string}>(
     "DELETE FROM published_route_bindings WHERE submission_id=$1 RETURNING public_path",[id]))
     .rows.map(r=>r.public_path);
   if(routes.some(p=>!ROUTE.test(p)))throw Error("unsafe_revocation_route");
   const next=revision_no+1;
   await c.query(
     "UPDATE content_submissions SET state='withdrawn',revision_no=$2,updated_at=now() WHERE id=$1",[id,next]);
   await c.query(
     "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,$2,'withdrawn',$3::jsonb)",
     [id,next,JSON.stringify([...new Set(routes)])]);
   removed++;
 }
 return removed;
}
export async function reconcileInvalidIssuerPublications(pool:Pool,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>200)throw Error("invalid_reconcile_limit");
 const c=await pool.connect();
 try{
   await c.query("BEGIN");
   const rows=(await c.query<Impact>(invalidIssuer,[limit])).rows;
   const withdrawn=await withdrawUnderLock(c,rows);
   await c.query("COMMIT");
   return {withdrawn,remainingMayExist:rows.length===limit};
 }catch(e){await c.query("ROLLBACK");throw e}
 finally{c.release()}
}
export async function revokeIssuerAuthority(pool:Pool,id:string,reasonRef:string,actor:string){
 if(!ID.test(id??"")||typeof reasonRef!=="string"||reasonRef.trim().length<8||
    typeof actor!=="string"||actor.trim().length<3||actor.length>120)
   throw Error("invalid_issuer_revocation");
 const c=await pool.connect();
 try{
   await c.query("BEGIN");
   const row=(await c.query<{active:boolean}>(
     "SELECT active FROM cms_review_authorities WHERE id=$1 FOR UPDATE",[id])).rows[0];
   if(!row)throw Error("issuer_not_found");
   if(row.active){
     await c.query("UPDATE cms_review_authorities SET active=false WHERE id=$1",[id]);
   }
   const affected=(await c.query<Impact>(invalidIssuer,[200])).rows;
   const matching=(await c.query<Impact>(
     `SELECT s.id,s.revision_no
      FROM content_submissions s
      JOIN LATERAL (
        SELECT v.version FROM published_content_versions v
        WHERE v.submission_id=s.id ORDER BY v.version DESC LIMIT 1
      ) pub ON true
      WHERE s.state='published' AND EXISTS(
        SELECT 1 FROM cms_public_issuer_dependencies dep
        WHERE dep.submission_id=s.id AND dep.version=pub.version AND dep.authority_id=$1
      ) ORDER BY s.id FOR UPDATE OF s`,[id])).rows;
   const withdrawn=await withdrawUnderLock(c,matching);
   await c.query(
     "INSERT INTO cms_issuer_revocations(authority_id,reason_ref,verification_actor,affected_count) VALUES($1,$2,$3,$4)",
     [id,reasonRef.trim(),actor.trim(),withdrawn]);
   await c.query("COMMIT");
   return {issuerId:id,withdrawn,alreadyInactive:!row.active,needsReconciliation:affected.length===200};
 }catch(e){await c.query("ROLLBACK");throw e}
 finally{c.release()}
}
