/**
 * TUR064 — integration feasibility contract, NOT wired to the deployed Worker.
 *
 * The current live CMS public media SQL omits generation, so it cannot satisfy
 * this contract. Do not silently accept missing epoch or use a media-owned
 * column as a revocation authority. The caller must supply an independently
 * authenticated guard reader with a separately controlled ownership/IAM path.
 *
 * A new instance MUST be created per HTTP request: each instance pins the
 * first verified (id, epoch). The original handler calls the lookup initially
 * and once more after reading and SHA-validating the image. This does NOT fence
 * bytes after its final check or represent a network receiver acknowledgement.
 */
const ID=/^[a-z0-9][a-z0-9_-]{0,95}$/;
const MAX_GENERATION=9223372036854775807n;
function epoch(value){
  if(typeof value==="number"){
    if(!Number.isSafeInteger(value)||value<1)return null;
    value=String(value);
  }
  if(typeof value==="bigint")value=value.toString();
  if(typeof value!=="string"||!/^[1-9][0-9]{0,18}$/.test(value))return null;
  const n=BigInt(value);
  return n<=MAX_GENERATION?n.toString():null;
}
/**
 * readMedia(id) returns {id,rightsApproved,generation,...original CMS asset}.
 * readGuardian(id) returns {approved,generation}. Both operations must throw
 * on SQL errors; do not convert error/timeouts to "approved" or stale cache.
 * Any missing or malformed data denies without touching object bytes.
 */
export function createGuardianApprovalLookup({readMedia,readGuardian}={}){
  if(typeof readMedia!=="function"||typeof readGuardian!=="function")
    throw Error("independent_guardian_required");
  let pinned=null;
  return async function findApprovedAsset(id,abortSignal){
    // Optional request-scoped AbortSignal supplied by the CMS handler. The
    // driver may still finish an already dispatched SQL statement: do NOT
    // advertise PostgreSQL backend cancellation without an independent proof.
    if(abortSignal?.aborted)throw Error('cms_request_aborted');
    if(typeof id!=="string"||!ID.test(id))throw Error("invalid_asset_id");
    const media=await readMedia(id,abortSignal);
    if(abortSignal?.aborted)throw Error('cms_request_aborted');
    if(!media||media.id!==id||media.rightsApproved!==true)return null;
    const mEpoch=epoch(media.generation);
    if(!mEpoch)return null; // production CMS public view currently lacks this!
    if(abortSignal?.aborted)throw Error('cms_request_aborted');
    const guard=await readGuardian(id,abortSignal);
    if(abortSignal?.aborted)throw Error('cms_request_aborted');
    if(!guard||guard.approved!==true||epoch(guard.generation)!==mEpoch)return null;
    if(pinned!==null&&(pinned.id!==id||pinned.epoch!==mEpoch))return null;
    if(abortSignal?.aborted)throw Error('cms_request_aborted');
    if(pinned===null)pinned={id,epoch:mEpoch};
    return media;
  };
}
