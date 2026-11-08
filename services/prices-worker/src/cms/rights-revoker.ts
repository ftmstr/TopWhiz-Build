/**
 * Authenticated internal rights revocation, never public endpoint.
 * Locks LAST PUBLISHED version dependencies to prevent draft bypass.
 * Public security-barrier views check rights on every read.
 */
import type {Pool} from "pg";
const ID=/^[a-zA-Z0-9._:-]{1,160}$/;
const PATH=/^\/$|^\/haberler(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$|^\/telefonlar(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$|^\/karsilastir$/;
type Kind="source"|"media";
interface Impact {id:string;revision_no:number}
export async function revokeLicensedResource(pool:Pool,kind:Kind,id:string,reasonRef:string,actor:string){
 if(!["source","media"].includes(kind)||!ID.test(id??"")||
    typeof reasonRef!=="string"||reasonRef.trim().length<8||
    typeof actor!=="string"||actor.trim().length<3||actor.length>120)
   throw Error("invalid_revocation_request");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const affected=(await client.query<Impact>(
   `SELECT s.id,s.revision_no FROM content_submissions s
    JOIN LATERAL (
      SELECT v.version FROM published_content_versions v
      WHERE v.submission_id=s.id AND v.version=COALESCE((SELECT h.publication_version FROM cms_publication_heads h WHERE h.submission_id=s.id),(SELECT max(p.version) FROM published_content_versions p WHERE p.submission_id=s.id)) LIMIT 1
    ) v ON true
    WHERE s.state='published' AND EXISTS (
       SELECT 1 FROM cms_public_dependencies d
       WHERE d.submission_id=s.id AND d.version=v.version
         AND d.resource_kind=$1 AND d.resource_id=$2
    ) ORDER BY s.id FOR UPDATE`,[kind,id])).rows;
  const table=kind==="source"?"cms_trusted_sources":"cms_media_assets";
  const modified=await client.query(
    "UPDATE "+table+" SET rights_approved=false WHERE id=$1 AND rights_approved=true RETURNING id",[id]);
  if(!modified.rowCount){
   const known=await client.query("SELECT 1 FROM "+table+" WHERE id=$1",[id]);
   if(!known.rowCount)throw Error("rights_resource_not_found");
  }
  let withdrawn=0;
  for(const row of affected){
   const removed=(await client.query<{public_path:string}>(
     "DELETE FROM published_route_bindings WHERE submission_id=$1 RETURNING public_path",
     [row.id])).rows.map(x=>x.public_path);
   const routes=[...new Set(removed)];
   if(routes.some(path=>!PATH.test(path)))throw Error("unsafe_published_route");
   const next=row.revision_no+1;
   await client.query(
     "UPDATE content_submissions SET state='withdrawn',revision_no=$2,updated_at=now() WHERE id=$1",
     [row.id,next]);
   await client.query(
     `INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes)
       VALUES($1,$2,'withdrawn',$3::jsonb)`,
     [row.id,next,JSON.stringify(routes)]);
   withdrawn++;
  }
  await client.query(
   `INSERT INTO cms_rights_revocations(asset_type,asset_id,reason_ref,actor,affected_count)
    VALUES($1,$2,$3,$4,$5)`,[kind,id,reasonRef.trim(),actor.trim(),withdrawn]);
  await client.query("COMMIT");
  return {kind,resourceId:id,withdrawn,pendingPurge:withdrawn>0};
 }catch(error){await client.query("ROLLBACK");throw error}
 finally{client.release()}
}
