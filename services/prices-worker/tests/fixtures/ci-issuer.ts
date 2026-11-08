/**
 * Synthetic CI-only Ed25519 signing. No test key material is stored in Git.
 * Actual reviewer signing must occur outside the CMS runtime/AI intake.
 */
import {generateKeyPairSync,sign} from "node:crypto";
import {canonicalAttestation} from "../../src/cms/attestation-signature.mjs";
export function temporaryCiIssuer(){
  if(process.env.CI!=="true")throw Error("test_signer_ci_only");
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  return {publicPem:publicKey.export({type:"spki",format:"pem"}).toString(),privateKey};
}
export async function addVerifiedAttestation(db,{
  submissionId,revision,type,authorityId,privateKey,verifiedAt,creditedAuthor="CI Synthetic Author"
}:{
 submissionId:string;revision:number;type:string;authorityId:string;
 privateKey:any;verifiedAt:Date;creditedAuthor?:string;
}){
  const evidenceRef="CI_SIGNED_EVIDENCE_"+type;
  const fields={
    submission_id:submissionId,revision_no:revision,attestation_type:type,
    authority_id:authorityId,status:"verified",evidence_ref:evidenceRef,
    credited_author:creditedAuthor,verified_at:verifiedAt
  };
  const signature=sign(null,canonicalAttestation(fields),privateKey).toString("base64");
  await db.query(
    "INSERT INTO cms_external_attestations(submission_id,revision_no,attestation_type,authority_id,evidence_ref,status,credited_author,verified_at,signature_base64) VALUES($1,$2,$3,$4,$5,'verified',$6,$7,$8)",
    [submissionId,revision,type,authorityId,evidenceRef,creditedAuthor,verifiedAt,signature]);
}
