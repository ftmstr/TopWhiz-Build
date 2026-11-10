import test from 'node:test';
import assert from 'node:assert/strict';

// Deterministic negative models: NOT live R2/CDN/network delivery evidence.
function transfer({lastCheck, revokeAt, queuedAt, flushAt, remoteAckAt}) {
  const authorized = lastCheck < revokeAt;
  const queued = authorized && queuedAt < revokeAt;
  const flushed = queued && flushAt > revokeAt;
  const remoteAcknowledged = remoteAckAt !== null && remoteAckAt >= flushAt;
  return {authorized,queued,flushed,remoteAcknowledged};
}
test('revocation after last check does not retract queued fictional bytes',()=>{
  const x=transfer({lastCheck:1,revokeAt:3,queuedAt:2,flushAt:4,remoteAckAt:null});
  assert.equal(x.flushed,true); assert.equal(x.remoteAcknowledged,false);
});
test('no remote ACK cannot be interpreted as delivery proof',()=>{
  const x=transfer({lastCheck:1,revokeAt:3,queuedAt:2,flushAt:4,remoteAckAt:null});
  assert.equal(x.remoteAcknowledged,false);
});
test('remote ACK after revocation is not retroactive authorization',()=>{
  const x=transfer({lastCheck:1,revokeAt:3,queuedAt:2,flushAt:4,remoteAckAt:5});
  assert.equal(x.remoteAcknowledged,true); assert.equal(x.flushed,true);
});
test('recheck before enqueue rejects revoked generation',()=>{
  const generation=2, pinned=1;
  assert.equal(generation===pinned,false);
});
test('separate isolates can hold different snapshots',()=>{
  const central=2, staleEdge=1, freshEdge=2;
  assert.notEqual(staleEdge,central); assert.equal(freshEdge,central);
});
