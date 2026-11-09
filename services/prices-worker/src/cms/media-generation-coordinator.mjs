/**
 * TOPWHIZ TUR020: CI-ONLY shared-state generation / rights-revocation model.
 *
 * Models a single serializable per-asset coordinator accessed by separate
 * JS facades (the sort of invariant a Durable Object COULD provide).
 * This is an IN-MEMORY, TEST-ONLY ledger, not an actual Durable Object,
 * durable database transaction, Cloudflare binding or network transport.
 *
 * Safety properties WITHIN THE MODEL:
 *  - All facades sharing ONE ledger serialize decisions per asset.
 *  - Each admission is issued at a monotonic publication generation.
 *  - Revocation closes admission before the first await.
 *  - A revoke may commit only after every admitted local permit has
 *    explicitly completed/cancelled; no time-based lease expiry.
 *  - A crashed/ambiguous mutation remains closed for reconciliation.
 *
 * Critically, a local permit release / JS stream end is NOT evidence
 * the last TCP/HTTP/CDN byte has arrived. This does NOT close Issue #22.
 */
const ID=/^[a-z0-9][a-z0-9_-]{0,95}$/;
function idCheck(id){
 if(typeof id!=="string"||!ID.test(id))throw Error("tur020_invalid_media_id");
}
function entry(){
 return {generation:0,phase:"absent",active:new Map(),revokeToken:null,
  nextGeneration:null,quarantineReason:null};
}
export function createSyntheticSharedAssetLedger(){
 const values=new Map(),pending=new Map();
 async function transact(id,operation){
  idCheck(id);
  if(typeof operation!=="function")throw Error("tur020_operation_required");
  const previous=pending.get(id)??Promise.resolve();
  const next=previous.catch(()=>{}).then(()=>{
   const prior=values.get(id)??entry();
   // Copy-on-write: failed operations do NOT mutate shared state.
   const draft={...prior,active:new Map(prior.active)};
   const result=operation(draft);
   if(result instanceof Promise)throw Error("tur020_async_in_atomic_section_forbidden");
   values.set(id,draft);
   return result;
  });
  pending.set(id,next.catch(()=>{}));
  return next;
 }
 return Object.freeze({
  transact,
  async inspectForTest(id){
   return transact(id,s=>Object.freeze({
    phase:s.phase,generation:s.generation,active:s.active.size,
    pendingGeneration:s.nextGeneration,quarantined:s.quarantineReason!==null
   }));
  }
 });
}
export function createSyntheticSharedMediaCoordinator(ledger){
 if(!ledger||typeof ledger.transact!=="function")
  throw Error("tur020_shared_ledger_required");
 const token=()=>crypto.randomUUID();
 return Object.freeze({
  async initializeFictionalAsset(id){
   return ledger.transact(id,s=>{
    if(s.phase!=="absent")throw Error("tur020_asset_already_initialized");
    s.phase="open";
    s.generation=1;
    return {phase:s.phase,generation:s.generation};
   });
  },
  async admit(id){
   return ledger.transact(id,s=>{
    if(s.phase!=="open"){
     return Object.freeze({status:s.phase==="revoked"?"revoked":"denied"});
    }
    const permit=token();
    s.active.set(permit,s.generation);
    return Object.freeze({status:"admitted",permit,generation:s.generation});
   });
  },
  async releaseLocalPermit(id,permit,reason){
   if(typeof permit!=="string"||!["drained","cancelled"].includes(reason))
    throw Error("tur020_local_terminal_evidence_required");
   return ledger.transact(id,s=>{
    if(!s.active.has(permit))throw Error("tur020_unknown_or_reused_permit");
    const generation=s.active.get(permit);
    s.active.delete(permit);
    return Object.freeze({status:"released",generation,reason,
     stillActive:s.active.size});
   });
  },
  async startRevocation(id,expectedGeneration){
   if(!Number.isSafeInteger(expectedGeneration)||expectedGeneration<1)
    throw Error("tur020_expected_generation_required");
   return ledger.transact(id,s=>{
    if(s.phase!=="open")
     return Object.freeze({status:"blocked",phase:s.phase});
    if(s.generation!==expectedGeneration)
     throw Error("tur020_stale_publication_generation");
    const capability=token();
    s.revokeToken=capability;
    s.nextGeneration=s.generation+1;
    s.phase="revoking";
    return Object.freeze({status:"revoking",
     capability,generation:s.generation,nextGeneration:s.nextGeneration});
   });
  },
  async commitRevocation(id,capability,withdraw){
   if(typeof capability!=="string"||typeof withdraw!=="function")
    throw Error("tur020_revoke_authority_required");
   // This single atomic transition prevents duplicated COMMIT callbacks.
   // Crucially, real readers must be enrolled in the SAME ledger: not
   // implemented for real Cloudflare, and no true last-byte evidence.
   const prepare=await ledger.transact(id,s=>{
    if(s.revokeToken!==capability||s.phase!=="revoking")
     throw Error("tur020_revoke_capability_or_phase_mismatch");
    if(s.active.size>0)
     return Object.freeze({status:"pending_readers",count:s.active.size});
    s.phase="committing";
    return Object.freeze({status:"committing",nextGeneration:s.nextGeneration});
   });
   if(prepare.status!=="committing")return prepare;
   try{
    await withdraw();
   }catch(error){
    await ledger.transact(id,s=>{
     if(s.phase==="committing"&&s.revokeToken===capability){
      s.phase="quarantined";
      s.quarantineReason="ambiguous_or_failed_commit";
     }
     return null;
    });
    throw error;
   }
   return ledger.transact(id,s=>{
    if(s.phase!=="committing"||s.revokeToken!==capability)
     throw Error("tur020_commit_result_requires_manual_reconciliation");
    s.generation=s.nextGeneration;
    s.phase="revoked";
    s.revokeToken=null;
    s.nextGeneration=null;
    return Object.freeze({status:"revoked",generation:s.generation});
   });
  },
  async quarantineAfterRestart(id){
   return ledger.transact(id,s=>{
    if(s.phase==="committing"){
     s.phase="quarantined";
     s.quarantineReason="restart_during_ambiguous_commit";
    }
    // No auto-finish or automatic expiring of unacknowledged readers.
    return Object.freeze({phase:s.phase,active:s.active.size,
     generation:s.generation});
   });
  },
  inspectForTest:id=>ledger.inspectForTest(id)
 });
}
