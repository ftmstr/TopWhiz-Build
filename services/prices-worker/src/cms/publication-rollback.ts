/** INTERNAL operator-only rollback to an older immutable PUBLIC version.
 * Never resurrects withdrawn content or ignores revoked media/source/issuer.
 * The publication head, optimistic revision, audit and durable purge event
 * are committed together. Authentication is required OUTSIDE this module.
 */
import type {Pool} from "pg";
import {verifyTrustedAttestation} from "./attestation-signature.mjs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ROUTE=/^\/$|^\/haberler(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$|^\/telefonlar(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$|^\/karsilastir$/;
const validVersion=(v:number)=>Number.isSafeInteger(v)&&v>0&&v<2147483647;
const recent=(when:Date,now:Date)=>{const d=now.getTime()-new Date(when).getTime();return d>=-300000&&d<=30*86400000};
type RecordState={revision_no:number;state:string;slug:string;content_type:string};
type Grant={approved:boolean;editorial_verified:boolean;originality_verified:boolean;specifications_verified:boolean;verified_by:string;verified_at:Date};
type Ref={attestation_type:string;authority_id:string;approved_public_key:string;approved_signature_base64:string;public_key_pem:string;active:boolean;reviewer_class:string;status:string;verified_at:Date;signature_base64:string;evidence_ref:string;credited_author:string};
export async function rollbackPublishedVersion(pool:Pool,{
 submissionId,expectedRevision,expectedPublicVersion,targetVersion,actor,reasonRef,now=new Date()
}:{
 submissionId:string;expectedRevision:number;expectedPublicVersion:number;
 targetVersion:number;actor:string;reasonRef:string;now?:Date
}){
 if(!UUID.test(submissionId??"")||
   ![expectedRevision,expectedPublicVersion,targetVersion].every(validVersion)||
   targetVersion>=expectedPublicVersion||
   typeof actor!=="string"||actor.trim().length<3||actor.length>120||
   typeof reasonRef!=="string"||reasonRef.trim().length<8||reasonRef.length>240||
   !(now instanceof Date)||!Number.isFinite(now.getTime()))
   throw Error("invalid_rollback_request");
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  // Phase 1: inspect historical immutable data without locking submissions.
  // Resource/issuer shared locks MUST come before submission FOR UPDATE:
  // rights revokers and issuer revokers use the same resource->submission order.
  const observed=(await c.query<{content_type:string}>(
    "SELECT content_type FROM content_submissions WHERE id=$1",
    [submissionId])).rows[0];
  if(!observed)throw Error("rollback_submission_missing");
  const snap=(await c.query<{public_payload:any}>(
    "SELECT public_payload FROM published_content_versions WHERE submission_id=$1 AND version=$2",
    [submissionId,targetVersion])).rows[0];
  if(!snap)throw Error("rollback_target_not_published");
  const grant=(await c.query<Grant>(
    "SELECT approved,editorial_verified,originality_verified,specifications_verified,verified_by,verified_at FROM cms_review_grants WHERE submission_id=$1 AND revision_no=$2 FOR SHARE",
    [submissionId,targetVersion])).rows[0];
  if(!grant?.approved||!grant.editorial_verified||!grant.originality_verified||
     (observed.content_type==="phone"&&!grant.specifications_verified)||!recent(grant.verified_at,now))
     throw Error("rollback_review_expired_or_revoked");
  const deps=(await c.query<{resource_kind:string;resource_id:string}>(
    "SELECT resource_kind,resource_id FROM cms_public_dependencies WHERE submission_id=$1 AND version=$2",
    [submissionId,targetVersion])).rows;
  if(!deps.some(d=>d.resource_kind==="source"))throw Error("rollback_missing_sources");
  for(const dep of deps){
    const table=dep.resource_kind==="source"?"cms_trusted_sources":dep.resource_kind==="media"?"cms_media_assets":null;
    if(!table)throw Error("rollback_invalid_dependency");
    const ok=await c.query("SELECT id FROM "+table+" WHERE id=$1 AND rights_approved=true FOR SHARE",[dep.resource_id]);
    if(ok.rowCount!==1)throw Error("rollback_rights_revoked");
  }
  const cover=snap.public_payload?.coverMediaId;
  if(cover!=null&&!deps.some(d=>d.resource_kind==="media"&&d.resource_id===cover))
    throw Error("rollback_missing_media_dependency");
  const issuerDeps=(await c.query<Ref>(
    "SELECT ref.attestation_type,ref.authority_id,ref.approved_public_key,ref.approved_signature_base64,a.public_key_pem,a.active,a.reviewer_class,att.status,att.verified_at,att.signature_base64,att.evidence_ref,att.credited_author FROM cms_public_issuer_dependencies ref JOIN cms_review_authorities a ON a.id=ref.authority_id JOIN cms_external_attestations att ON att.submission_id=ref.submission_id AND att.revision_no=ref.version AND att.attestation_type=ref.attestation_type AND att.authority_id=ref.authority_id WHERE ref.submission_id=$1 AND ref.version=$2 FOR SHARE OF a,att",
    [submissionId,targetVersion])).rows;
  // Inner joins must not silently discard missing issuer/evidence references.
  const expectedRefs=(await c.query<{n:number}>(
    "SELECT count(*)::int AS n FROM cms_public_issuer_dependencies WHERE submission_id=$1 AND version=$2",
    [submissionId,targetVersion])).rows[0].n;
  if(issuerDeps.length!==expectedRefs)throw Error("rollback_issuer_evidence_missing");
  if(grant.verified_by.startsWith("auto-gate:")&&
     issuerDeps.length!==(observed.content_type==="phone"?3:2))
    throw Error("rollback_missing_issuer_evidence");
  for(const ref of issuerDeps){
    if(ref.active!==true||ref.public_key_pem!==ref.approved_public_key||
      ref.status!=="verified"||ref.signature_base64!==ref.approved_signature_base64||
      !recent(ref.verified_at,now)||
      !verifyTrustedAttestation({...ref,submission_id:submissionId,revision_no:targetVersion},
        {id:ref.authority_id,active:ref.active,reviewer_class:ref.reviewer_class,public_key_pem:ref.public_key_pem}))
        throw Error("rollback_issuer_revoked");
  }
  // Phase 2: lock mutable publication HEAD after all rights and issuer rows.
  const current=(await c.query<RecordState>(
    "SELECT revision_no,state,slug,content_type FROM content_submissions WHERE id=$1 FOR UPDATE",
    [submissionId])).rows[0];
  if(!current||current.state!=="published")throw Error("rollback_current_publication_required");
  if(current.revision_no!==expectedRevision)throw Error("revision_conflict");
  const active=(await c.query<{version:number}>(
    "SELECT COALESCE((SELECT publication_version FROM cms_publication_heads WHERE submission_id=$1),(SELECT max(version) FROM published_content_versions WHERE submission_id=$1)) AS version",
    [submissionId])).rows[0]?.version;
  if(active!==expectedPublicVersion)throw Error("active_public_version_conflict");
  const routes=(await c.query<{public_path:string}>(
    "SELECT public_path FROM published_route_bindings WHERE submission_id=$1",
    [submissionId])).rows.map(x=>x.public_path);
  const detail="/"+(current.content_type==="news"?"haberler":"telefonlar")+"/"+current.slug;
  if(!routes.includes(detail)||routes.length>10||routes.some(x=>!ROUTE.test(x)))
    throw Error("rollback_routes_invalid");
  const revision=expectedRevision+1;
  await c.query(
    "INSERT INTO cms_publication_heads(submission_id,publication_version) VALUES($1,$2) ON CONFLICT(submission_id) DO UPDATE SET publication_version=EXCLUDED.publication_version,updated_at=now()",
    [submissionId,targetVersion]);
  await c.query("UPDATE content_submissions SET revision_no=$2,updated_at=now() WHERE id=$1",[submissionId,revision]);
  await c.query(
    "INSERT INTO cms_publication_rollback_audit(submission_id,from_version,to_version,resulting_revision,reason_ref,actor) VALUES($1,$2,$3,$4,$5,$6)",
    [submissionId,expectedPublicVersion,targetVersion,revision,reasonRef.trim(),actor.trim()]);
  const outbox=(await c.query<{id:string}>(
    "INSERT INTO cms_delivery_outbox(submission_id,revision_no,event_kind,routes) VALUES($1,$2,'published',$3::jsonb) RETURNING id",
    [submissionId,revision,JSON.stringify([...new Set(routes)])])).rows[0];
  await c.query("COMMIT");
  return {submissionId,previousVersion:expectedPublicVersion,activeVersion:targetVersion,
    resultingRevision:revision,purgeEventId:outbox.id,routes};
 }catch(e){await c.query("ROLLBACK");throw e}
 finally{c.release()}
}
