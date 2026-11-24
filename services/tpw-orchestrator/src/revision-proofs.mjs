/** Synthetic two-role trust contract. Public keys are pinned outside editor responses. */
import {candidateDigest} from './lineage.mjs';
const bytes=x=>new TextEncoder().encode(JSON.stringify(x));
const HASH=/^[a-f0-9]{64}$/;
export const b64url=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function decode(s,n){
 if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s)||s.length!==Math.ceil(n*8/6))throw Error('REVISION_SIGNATURE_FORMAT');
 const x=Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 if(x.length!==n||b64url(x)!==s)throw Error('REVISION_SIGNATURE_FORMAT');return x;
}
export const grantMessage=(source,expiresAt)=>['TPW_SYNTHETIC_LICENSE_V1',source.url,source.publisher,source.claimHash,source.rights,expiresAt];
export const editorMessage=(article,previous,slot,grants)=>['TPW_SYNTHETIC_EDITOR_V1',previous,slot,article,grants];
async function verify(key,message,signature){
 if(!await crypto.subtle.verify('Ed25519',key,decode(signature,64),bytes(message)))throw Error('REVISION_SIGNATURE_INVALID');
}
export async function verifyRevisionProofs(env,article,previous,slot,proof,now){
 if(!Number.isSafeInteger(now)||!(previous===null||HASH.test(previous))||!/^\d{10}$/.test(slot))throw Error('REVISION_PROOF_CONTEXT');
 if(!proof||Object.keys(proof).length!==2||!Array.isArray(proof.grants)||proof.grants.length!==article.sources.length)throw Error('REVISION_PROOF_REQUIRED');
 const ep=decode(env.TPW_EDITOR_PUBLIC_KEY,32),lp=decode(env.TPW_LICENSE_PUBLIC_KEY,32);
 if(b64url(ep)===b64url(lp))throw Error('REVISION_ROLE_SEPARATION');
 const editor=await crypto.subtle.importKey('raw',ep,'Ed25519',false,['verify']);
 const issuer=await crypto.subtle.importKey('raw',lp,'Ed25519',false,['verify']);
 const tokens=[await candidateDigest(['KEY',b64url(ep)]),await candidateDigest(['KEY',b64url(lp)])];
 let expiresAt=Number.MAX_SAFE_INTEGER;
 for(let i=0;i<proof.grants.length;i++){
  const g=proof.grants[i];
  if(!g||Object.keys(g).length!==2||!Number.isSafeInteger(g.expiresAt)||g.expiresAt<=now)throw Error('REVISION_GRANT_EXPIRED');
  const m=grantMessage(article.sources[i],g.expiresAt);
  await verify(issuer,m,g.signature);
  tokens.push(await candidateDigest(m));expiresAt=Math.min(expiresAt,g.expiresAt);
 }
 await verify(editor,editorMessage(article,previous,slot,proof.grants),proof.editorSignature);
 return {tokens:[...new Set(tokens)],expiresAt,proofHash:await candidateDigest(proof)};
}
