/** Local-only independently signed revocation commands. No HTTP administration endpoint. */
import {b64url,decode,verify} from './revision-proofs.mjs';
import {canonicalHash} from './canonical.mjs';
const HASH=/^[a-f0-9]{64}$/;
export const revokeMessage=(token,epoch)=>['TPW_SYNTHETIC_REVOKE_V1',epoch,epoch+1,token];
export async function readAuthorityEpoch(db){
 const row=await db.prepare('SELECT epoch FROM tpw_revision_authority WHERE singleton=1').first();
 if(!Number.isSafeInteger(row?.epoch)||row.epoch<0)throw Error('AUTHORITY_UNAVAILABLE');
 return row.epoch;
}
export async function applyRevocation({env,token,epoch,signature,nowFn=Date.now}){
 if(env.TPW_MODE!=='LOCAL_DRY_RUN'||env.TPW_RELEASE_GATE!=='CLOSED'||env.TPW_GITHUB_WRITES!=='DISABLED')throw Error('AUTHORITY_LOCAL_ONLY');
 if(typeof token!=='string'||!HASH.test(token)||!Number.isSafeInteger(epoch)||epoch<0||epoch>=Number.MAX_SAFE_INTEGER)throw Error('AUTHORITY_COMMAND');
 const admin=decode(env.TPW_REVOCATION_PUBLIC_KEY,32),editor=decode(env.TPW_EDITOR_PUBLIC_KEY,32),issuer=decode(env.TPW_LICENSE_PUBLIC_KEY,32);
 if(new Set([admin,editor,issuer].map(b64url)).size!==3)throw Error('REVISION_ROLE_SEPARATION');
 const msg=revokeMessage(token,epoch),key=await crypto.subtle.importKey('raw',admin,'Ed25519',false,['verify']);
 await verify(key,msg,signature);
 const db=env.TPW_DB,now=nowFn(),commandHash=await canonicalHash(msg);
 if(!Number.isSafeInteger(now))throw Error('AUTHORITY_CLOCK');
 // Atomic epoch CAS: NULL token violates NOT NULL if stale; existing token cannot be revoked twice.
 await db.batch([
  db.prepare('INSERT INTO tpw_revision_revocations(token,revoked_at) VALUES(CASE WHEN (SELECT epoch FROM tpw_revision_authority WHERE singleton=1)=? THEN ? ELSE NULL END,?)').bind(epoch,token,now),
  db.prepare('INSERT INTO tpw_revision_authority_events(epoch,token,command_hash,signature,recorded_at) VALUES(?,?,?,?,?)').bind(epoch+1,token,commandHash,signature,now),
  db.prepare('UPDATE tpw_revision_authority SET epoch=? WHERE singleton=1 AND epoch=?').bind(epoch+1,epoch)
 ]);
 return {epoch:epoch+1,commandHash};
}
