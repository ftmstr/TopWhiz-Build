/** A pinned, separate P-256 signer binds TPW2 approval to the complete bilingual document.
 * The source/model-provided VERIFIED flags or a SHA-256 digest are not external fact/rights proof.
 * This authenticates the attestation key, not independent truth or real publication clearance.
 */
const DOMAIN='TOPWHIZ-TPW2-EDITORIAL-APPROVAL/v1\n';
function decode(s,pattern){
 if(typeof s!=='string'||!pattern.test(s))throw new Error('EDITOR_PROOF_ENCODING_INVALID');
 const x=s.replace(/-/g,'+').replace(/_/g,'/');
 return Uint8Array.from(atob(x+'='.repeat((4-x.length%4)%4)),ch=>ch.charCodeAt(0));
}
export function editorialApprovalBytes(doc){
 if(!doc||!doc.review||!Array.isArray(doc.sources))throw new Error('EDITOR_PROOF_DOCUMENT_INVALID');
 // Serialize exactly the document that will be written; signature is the only excluded field.
 const copy=JSON.parse(JSON.stringify(doc));
 delete copy.review.signature;
 return new TextEncoder().encode(DOMAIN+JSON.stringify(copy));
}
export async function verifyEditorialApproval(doc,spkiBase64){
 if(!doc?.review||typeof spkiBase64!=='string'||!spkiBase64)throw new Error('EDITOR_TRUST_ROOT_NOT_PINNED');
 const spki=decode(spkiBase64,/^[A-Za-z0-9+/]+={0,2}$/),sig=decode(doc.review.signature,/^[A-Za-z0-9_-]{86}$/);
 if(sig.length!==64||spki.length<60||spki.length>300)throw new Error('EDITOR_PROOF_INVALID_LENGTH');
 let key;
 try{key=await crypto.subtle.importKey('spki',spki,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])}
 catch{throw new Error('EDITOR_TRUST_ROOT_INVALID')}
 const ok=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,sig,editorialApprovalBytes(doc));
 if(!ok)throw new Error('EDITOR_SIGNATURE_INVALID');
 return true;
}
