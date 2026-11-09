import test from "node:test";
import assert from "node:assert/strict";
import {createSyntheticSharedAssetLedger,
 createSyntheticSharedMediaCoordinator} from
 "../services/prices-worker/src/cms/media-generation-coordinator.mjs";

// Test-only shared ledger: this is NOT a deployed Cloudflare Durable Object.
test("TUR020 two separate facade instances share 32 reader admissions and a fenced generation revoke",async()=>{
 const ledger=createSyntheticSharedAssetLedger();
 const a=createSyntheticSharedMediaCoordinator(ledger);
 const b=createSyntheticSharedMediaCoordinator(ledger);
 const id="ci-tur020-shared-image";
 assert.deepEqual(await a.initializeFictionalAsset(id),
  {phase:"open",generation:1});
 const reads=await Promise.all(Array.from({length:32},(_,i)=>
  (i%2?a:b).admit(id)));
 assert.ok(reads.every(x=>x.status==="admitted"&&x.generation===1));
 assert.equal(new Set(reads.map(x=>x.permit)).size,32);
 assert.equal((await b.inspectForTest(id)).active,32);
 const revoke=await a.startRevocation(id,1);
 assert.equal(revoke.status,"revoking");
 assert.equal(revoke.nextGeneration,2);
 const late=await Promise.all(Array.from({length:12},(_,i)=>
  (i%2?a:b).admit(id)));
 assert.ok(late.every(x=>x.status==="denied"));
 const duplicate=await b.startRevocation(id,1);
 assert.equal(duplicate.status,"blocked");
 let commits=0;
 const pending=await b.commitRevocation(id,revoke.capability,async()=>{commits++});
 assert.deepEqual(pending,{status:"pending_readers",count:32});
 assert.equal(commits,0);
 const terminal=await Promise.all(reads.map((x,i)=>
  (i%2?b:a).releaseLocalPermit(id,x.permit,i<16?"drained":"cancelled")));
 assert.equal(terminal.length,32);
 assert.equal((await a.inspectForTest(id)).active,0);
 const committed=await b.commitRevocation(id,revoke.capability,async()=>{commits++});
 assert.equal(committed.status,"revoked");
 assert.equal(committed.generation,2);
 assert.equal(commits,1);
 assert.equal((await a.admit(id)).status,"revoked");
 assert.equal((await b.admit(id)).status,"revoked");
 await assert.rejects(()=>b.commitRevocation(id,revoke.capability,async()=>{commits++}),
  /tur020_revoke_capability_or_phase_mismatch/);
 await assert.rejects(()=>a.releaseLocalPermit(id,reads[0].permit,"drained"),
  /tur020_unknown_or_reused_permit/);
 assert.equal(commits,1);
 console.log(JSON.stringify({suite:"TUR020_SHARED_GENERATION_MODEL",
  facades:2,admitted:32,drained:16,cancelled:16,deniedLate:12,
  commitCount:commits,finalGeneration:2,actualDurableObject:"NOT_RUN",
  realLastNetworkByte:"NOT_PROVEN"}));
});

test("TUR020 restarted facade does not lose unacknowledged local permits",async()=>{
 const ledger=createSyntheticSharedAssetLedger(),id="ci-tur020-restarted";
 const a=createSyntheticSharedMediaCoordinator(ledger);
 await a.initializeFictionalAsset(id);
 const permit=await a.admit(id),rev=await a.startRevocation(id,1);
 const b=createSyntheticSharedMediaCoordinator(ledger);
 assert.equal((await b.inspectForTest(id)).active,1);
 assert.equal((await b.quarantineAfterRestart(id)).phase,"revoking");
 const denied=await b.commitRevocation(id,rev.capability,async()=>{
  throw Error("must_not_commit_with_active_reader");
 });
 assert.equal(denied.status,"pending_readers");
 assert.equal((await b.admit(id)).status,"denied");
 await b.releaseLocalPermit(id,permit.permit,"cancelled");
 await assert.rejects(()=>b.commitRevocation(id,rev.capability,
  async()=>{throw Error("synthetic_ambiguous_COMMIT_reply")}),
  /synthetic_ambiguous_COMMIT_reply/);
 const after=await a.inspectForTest(id);
 assert.equal(after.phase,"quarantined");
 assert.equal(after.quarantined,true);
 assert.equal((await b.admit(id)).status,"denied");
 await assert.rejects(()=>a.commitRevocation(id,rev.capability,async()=>{}),
  /tur020_revoke_capability_or_phase_mismatch/);
});

test("TUR020 crash/ack-loss during a withdrawal never reopens read admission",async()=>{
 const ledger=createSyntheticSharedAssetLedger(),id="ci-tur020-acklost";
 const a=createSyntheticSharedMediaCoordinator(ledger);
 await a.initializeFictionalAsset(id);
 const rev=await a.startRevocation(id,1);
 let unblock;let started;
 const startedPromise=new Promise(resolve=>{started=resolve});
 const held=new Promise(resolve=>{unblock=resolve});
 const committing=a.commitRevocation(id,rev.capability,async()=>{
  started();
  await held;
 });
 await startedPromise;
 const restarted=createSyntheticSharedMediaCoordinator(ledger);
 assert.equal((await restarted.inspectForTest(id)).phase,"committing");
 assert.equal((await restarted.admit(id)).status,"denied");
 const afterRestart=await restarted.quarantineAfterRestart(id);
 assert.equal(afterRestart.phase,"quarantined");
 unblock();
 await assert.rejects(()=>committing,/tur020_commit_result_requires_manual_reconciliation/);
 assert.equal((await restarted.inspectForTest(id)).phase,"quarantined");
});

test("TUR020 trusted ledger and transport boundary negative evidence remain OPEN",async()=>{
 const id="ci-tur020-split-brain";
 // Separate ledgers model independent Cloudflare isolates WITHOUT an
 // actual shared Durable Object. They cannot enforce each other's fence.
 const left=createSyntheticSharedMediaCoordinator(createSyntheticSharedAssetLedger());
 const right=createSyntheticSharedMediaCoordinator(createSyntheticSharedAssetLedger());
 await Promise.all([left.initializeFictionalAsset(id),
  right.initializeFictionalAsset(id)]);
 const old=await right.admit(id);
 const rev=await left.startRevocation(id,1);
 await left.commitRevocation(id,rev.capability,async()=>{});
 assert.equal((await left.admit(id)).status,"revoked");
 assert.equal((await right.admit(id)).status,"admitted",
  "separate ledgers reproduce cross-isolate bypass");

 // Even with ONE shared ledger a caller may claim a stream is drained
 // while HTTP/CDN buffers hold verified image bytes. This is a
 // NEGATIVE TRANSPORT COUNTEREXAMPLE, not last-byte atomicity.
 const ledger=createSyntheticSharedAssetLedger();
 const one=createSyntheticSharedMediaCoordinator(ledger);
 const two=createSyntheticSharedMediaCoordinator(ledger);
 const asset="ci-tur020-buffered-transport";
 await one.initializeFictionalAsset(asset);
 const permit=await two.admit(asset);
 const bufferedBytes=Uint8Array.of(1,2,3,4,5);
 await two.releaseLocalPermit(asset,permit.permit,"drained");
 const mutation=await one.startRevocation(asset,1);
 await one.commitRevocation(asset,mutation.capability,async()=>{});
 const deliveredAfterCommit=bufferedBytes.byteLength;
 assert.equal(deliveredAfterCommit,5);
 assert.equal((await two.admit(asset)).status,"revoked");
 console.log(JSON.stringify({suite:"TUR020_UNSOLVED_DISTRIBUTION_TRANSPORT",
  splitBrainWithoutSharedLedger:true,bytesAfterLocalStreamAck:deliveredAfterCommit,
  originalTur018NegativeEvidence:"12_SYNTHETIC_RACES_99276_BYTES",
  issue22:"OPEN",actualCloudflareDurableObject:"NOT_RUN",
  networkLastByteGuarantee:"NOT_PROVEN"}));
});

test("TUR020 invalid generation, forged permit and malformed IDs fail closed",async()=>{
 const ledger=createSyntheticSharedAssetLedger();
 const a=createSyntheticSharedMediaCoordinator(ledger);
 const id="ci-tur020-fail-closed";
 await assert.rejects(()=>a.initializeFictionalAsset("../traversal"),
  /tur020_invalid_media_id/);
 await a.initializeFictionalAsset(id);
 await assert.rejects(()=>a.initializeFictionalAsset(id),
  /tur020_asset_already_initialized/);
 await assert.rejects(()=>a.startRevocation(id,2),
  /tur020_stale_publication_generation/);
 await assert.rejects(()=>a.releaseLocalPermit(id,"forged","drained"),
  /tur020_unknown_or_reused_permit/);
 await assert.rejects(()=>a.releaseLocalPermit(id,"x","untrusted"),
  /tur020_local_terminal_evidence_required/);
 const rev=await a.startRevocation(id,1);
 await assert.rejects(()=>a.commitRevocation(id,"fake",async()=>{}),
  /tur020_revoke_capability_or_phase_mismatch/);
 assert.equal((await a.inspectForTest(id)).phase,"revoking");
 await a.commitRevocation(id,rev.capability,async()=>{});
 assert.equal((await a.inspectForTest(id)).generation,2);
});
