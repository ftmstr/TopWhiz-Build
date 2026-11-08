import {createPublicKey,verify} from "node:crypto";
/**
 * Canonical Ed25519 attestation binds issuer to EXACT revision, evidence,
 * verification state and credited author. Signing key is NEVER stored in DB
 * or Git; public key must be installed out-of-band by the security owner.
 */
const ID=/^[a-zA-Z0-9._:-]{1,160}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds=new Set(["editorial","originality","specifications"]);
export function canonicalAttestation(row){
  if(!row||!UUID.test(row.submission_id??"")||
    !Number.isSafeInteger(row.revision_no)||row.revision_no<1||
    !kinds.has(row.attestation_type)||!ID.test(row.authority_id??"")||
    row.status!=="verified"||
    typeof row.evidence_ref!=="string"||row.evidence_ref.length<8||
    typeof row.credited_author!=="string"||row.credited_author.length<3||
    !Number.isFinite(Date.parse(row.verified_at)))throw Error("invalid_attestation_fields");
  return Buffer.from(JSON.stringify([
    "topwhiz-cms-ed25519-v1",row.submission_id,row.revision_no,
    row.attestation_type,row.authority_id,row.status,row.evidence_ref,
    row.credited_author,new Date(row.verified_at).toISOString()
  ]),"utf8");
}
export function verifyTrustedAttestation(row,authority){
  try{
    if(authority?.active!==true||authority.id!==row.authority_id||
      !["human","licensed_verifier"].includes(authority.reviewer_class)||
      !/^[A-Za-z0-9+/]{80,}={0,2}$/.test(row.signature_base64??"") ||
      typeof authority.public_key_pem!=="string" ||
      authority.public_key_pem.length>3000)return false;
    const key=createPublicKey(authority.public_key_pem);
    if(key.asymmetricKeyType!=="ed25519")return false;
    const raw=Buffer.from(row.signature_base64,"base64");
    if(raw.length!==64)return false;
    return verify(null,canonicalAttestation(row),key,raw);
  }catch{return false}
}
