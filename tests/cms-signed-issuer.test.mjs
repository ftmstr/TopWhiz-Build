import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {canonicalAttestation,verifyTrustedAttestation} from "../services/prices-worker/src/cms/attestation-signature.mjs";
const {publicKey,privateKey}=generateKeyPairSync("ed25519");
const {publicKey:wrongPublic}=generateKeyPairSync("ed25519");
const authority={
  id:"trusted-ci-authority",active:true,reviewer_class:"licensed_verifier",
  public_key_pem:publicKey.export({type:"spki",format:"pem"}).toString()
};
const content={
  submission_id:"11111111-1111-4111-8111-111111111111",revision_no:1,
  attestation_type:"editorial",authority_id:"trusted-ci-authority",
  evidence_ref:"SYNTHETIC_SOURCE_CONTRACT",status:"verified",
  credited_author:"CI Test Author",verified_at:new Date("2026-11-07T22:00:00Z")
};
function signed(){
  return {...content,signature_base64:sign(null,canonicalAttestation(content),privateKey).toString("base64")};
}
test("independent signature verifies only exact attested revision and immutable evidence",()=>{
  const original=signed();
  assert.equal(verifyTrustedAttestation(original,authority),true);
  for(const patch of [
    {revision_no:2},{evidence_ref:"CHANGED_EVIDENCE"},{status:"revoked"},
    {credited_author:"Different Author"},{attestation_type:"originality"},
    {authority_id:"other-issuer"},{verified_at:new Date("2026-11-07T21:00:00Z")},
    {signature_base64:"A".repeat(88)}
  ])assert.equal(verifyTrustedAttestation({...original,...patch},authority),false,JSON.stringify(patch));
  assert.equal(verifyTrustedAttestation(original,{...authority,active:false}),false);
  assert.equal(verifyTrustedAttestation(original,{...authority,public_key_pem:wrongPublic.export({type:"spki",format:"pem"}).toString()}),false);
});
