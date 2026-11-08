/**
 * Independent, DB-evidence-based auto-grant. No AI claims or request flags
 * can write grants. Run as an isolated reviewer role with SELECT on source/
 * media/attestations and INSERT on cms_review_grants; separate from intake.
 */
import type { Pool } from "pg";
import { assessPublishableContent } from "../../../content/publish-policy.mjs";
import { verifyTrustedAttestation } from "./attestation-signature.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(reason:string){return {approved:false,reason} as const}

export async function independentlyAuthorizeRevision(pool:Pool,id:string,revision:number,now=new Date()){
  if(!UUID.test(id??"")||!Number.isInteger(revision)||revision<1)
    throw Error("invalid_review_target");
  const conn=await pool.connect();
  try{
    await conn.query("BEGIN");
    const row=(await conn.query<{id:string;state:string;revision_no:number;payload:any}>(
      "SELECT id,state,revision_no,payload FROM content_submissions WHERE id=$1 FOR SHARE",[id])).rows[0];
    if(!row||row.revision_no!==revision||row.state==="withdrawn"){
      await conn.query("ROLLBACK");return fail("missing_or_wrong_revision");
    }
    const evidence=(await conn.query<{
      attestation_type:string;status:string;credited_author:string;verified_at:Date;
      authority_id:string;active:boolean;reviewer_class:string;
      evidence_ref:string;signature_base64:string;public_key_pem:string;issuer_id:string
    }>(
      "SELECT a.attestation_type,a.status,a.credited_author,a.verified_at,a.authority_id,a.evidence_ref,a.signature_base64,r.id AS issuer_id,r.public_key_pem,r.active,r.reviewer_class FROM cms_external_attestations a JOIN cms_review_authorities r ON r.id=a.authority_id WHERE a.submission_id=$1 AND a.revision_no=$2",
      [id,revision])).rows;
    const expected=row.payload.type==="phone"?["editorial","originality","specifications"]:["editorial","originality"];
    if(expected.some(kind=>!evidence.some(v=>v.attestation_type===kind &&
      v.active && v.status==="verified" &&
      verifyTrustedAttestation({...v,submission_id:id,revision_no:revision},{
        id:v.issuer_id,active:v.active,reviewer_class:v.reviewer_class,public_key_pem:v.public_key_pem
      }) &&
      now.getTime()-new Date(v.verified_at).getTime()>=-300000 &&
      now.getTime()-new Date(v.verified_at).getTime()<=30*86400000))){
      await conn.query("ROLLBACK");return fail("independent_attestations_missing");
    }
    const author=evidence.find(v=>v.attestation_type==="editorial")?.credited_author;
    if(!author){await conn.query("ROLLBACK");return fail("author_attribution_missing")}
    const ids=row.payload.sources;
    if(!Array.isArray(ids)||ids.length===0||ids.length>20||
       ids.some((v:unknown)=>typeof v!=="string")||new Set(ids).size!==ids.length){
      await conn.query("ROLLBACK");return fail("invalid_source_identity");
    }
    const sources=(await conn.query<{id:string;source_type:string;rights_ref:string;source_url:string;rights_approved:boolean}>(
      "SELECT id,source_type,rights_ref,source_url,rights_approved FROM cms_trusted_sources WHERE id=ANY($1::varchar[])",[ids])).rows;
    if(sources.length!==ids.length||sources.some(v=>!v.rights_approved||
      !v.rights_ref?.trim()||!/^https:\/\/[^/?#]+\//.test(v.source_url+"/"))){
      await conn.query("ROLLBACK");return fail("source_license_missing");
    }
    const mediaId=row.payload.coverMediaId;
    const media=mediaId?(await conn.query<{rights_approved:boolean;license_evidence_ref:string;sha256_hex:string;r2_key:string}>(
      "SELECT rights_approved,license_evidence_ref,sha256_hex,r2_key FROM cms_media_assets WHERE id=$1",[mediaId])).rows[0]:null;
    if(mediaId&&(!media||!media.rights_approved||
      !media.license_evidence_ref||!media.r2_key?.includes(media.sha256_hex))){
      await conn.query("ROLLBACK");return fail("media_license_missing");
    }
    const trusted={
      sourceRightsApproved:true,sourceRightsRef:sources[0].rights_ref,
      editorialVerification:"verified",approvedSourceIds:ids,
      approvedMediaIds:mediaId?[mediaId]:[],
      originalityChecked:true,specificationsVerified:row.payload.type==="phone",
      sourceType:sources[0].source_type
    };
    const validation=assessPublishableContent(row.payload,trusted,now);
    if(validation.status!=="ready_for_auto_publish"){
      await conn.query("ROLLBACK");return {approved:false,reason:"content_policy_failed",failures:validation.failures};
    }
    const authority=evidence.find(v=>v.attestation_type==="editorial")!.authority_id;
    const actor="auto-gate:"+authority;
    const result=await conn.query(
      "INSERT INTO cms_review_grants(submission_id,revision_no,approved,editorial_verified,originality_verified,specifications_verified,verified_by,credited_author,verified_at) VALUES($1,$2,true,true,true,$3,$4,$5,$6) ON CONFLICT(submission_id,revision_no) DO NOTHING RETURNING id",
      [id,revision,row.payload.type==="phone",actor,author,now]);
    if(!result.rowCount){
      const prior=(await conn.query<{approved:boolean;credited_author:string}>(
        "SELECT approved,credited_author FROM cms_review_grants WHERE submission_id=$1 AND revision_no=$2",
        [id,revision])).rows[0];
      if(!prior?.approved||prior.credited_author!==author){
        await conn.query("ROLLBACK");return fail("review_grant_conflict");
      }
    }
    await conn.query("COMMIT");
    return {approved:true,reviewer:actor};
  }catch(e){
    await conn.query("ROLLBACK");throw e;
  }finally{conn.release()}
}
