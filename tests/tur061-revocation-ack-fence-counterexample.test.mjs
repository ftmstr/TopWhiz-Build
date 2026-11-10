import test from 'node:test';
import assert from 'node:assert/strict';

// TUR061: deliberately isolated negative model; no R2/CDN or real receiver.
const state = () => ({generation: 1, approved: true, queued: [], received: []});
function authorize(s) { return s.approved ? s.generation : null; }
function enqueue(s, generation, bytes) {
  if (s.approved && generation === s.generation) s.queued.push(bytes);
}
function revoke(s) { s.approved = false; s.generation += 1; }
function flush(s) { s.received.push(...s.queued); s.queued = []; }
test('revocation after enqueue cannot retract already queued bytes', () => {
  const s = state(); const g = authorize(s);
  enqueue(s, g, 'FICTIONAL_CHUNK'); revoke(s); flush(s);
  assert.deepEqual(s.received, ['FICTIONAL_CHUNK']);
});
test('generation recheck blocks not-yet-queued bytes', () => {
  const s = state(); const g = authorize(s); revoke(s);
  enqueue(s, g, 'BLOCKED'); flush(s); assert.equal(s.received.length, 0);
});
test('local send completion is not remote final-byte acknowledgement', () => {
  const s = state(); enqueue(s, authorize(s), 'FICTIONAL');
  const localWriteAccepted = s.queued.length === 1;
  assert.equal(localWriteAccepted, true);
  assert.equal(s.received.length, 0);
});
test('independent edges retain different generation snapshots', () => {
  const origin = state(); const edge = {generation: origin.generation, approved: origin.approved};
  revoke(origin);
  assert.equal(authorize(origin), null);
  assert.equal(authorize(edge), 1); // stale edge is unsafe, not a PASS.
});
