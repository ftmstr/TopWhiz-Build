/** Exact-JSON source lineage; a hash does not establish source authenticity. */
export async function candidateDigest(candidate){
 const result=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(candidate)));
 return Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,'0')).join('');
}
export function originMatches(candidate,proposal){
 if(!proposal?.sources?.some(s=>s.type==='PRIMARY'&&s.url===candidate?.source?.url&&s.publisher===candidate.source.publisher&&s.rights===candidate.source.rights))return false;
 if(candidate.kind==='device')return ['brand','model','sku','region'].every(k=>proposal.device?.[k]===candidate.device?.[k]);
 return candidate.kind==='news';
}