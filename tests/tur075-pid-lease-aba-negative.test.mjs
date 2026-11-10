import test from 'node:test';
import assert from 'node:assert/strict';

// Deterministic counterexamples, NOT a PostgreSQL integration test.
function unsafeCancel(backendPid, sessions) { return sessions.find(s => s.pid === backendPid) ?? null; }
function fencedCancel(ticket, sessions) {
  const s = sessions.find(s => s.pid === ticket.pid);
  if (!s || s.lease !== ticket.lease || s.request !== ticket.request || s.role !== ticket.role || s.closed) return null;
  return s;
}
const old = { pid: 7421, lease: 'lease-A', request: 'req-A', role: 'media_reader', closed: false };
const reused = { pid: 7421, lease: 'lease-B', request: 'req-B', role: 'media_reader', closed: false };

test('raw PID cancellation targets a different request after PID reuse (negative evidence)', () => {
  assert.equal(unsafeCancel(old.pid, [reused])?.request, 'req-B');
});
test('request lease identity rejects ABA PID reuse', () => {
  assert.equal(fencedCancel(old, [reused]), null);
});
test('request lease identity accepts only original live backend', () => {
  assert.deepEqual(fencedCancel(old, [old]), old);
});
test('closed backend cannot be cancelled through a stale ticket', () => {
  assert.equal(fencedCancel(old, [{...old, closed:true}]), null);
});
test('same-role different request cannot inherit cancel authority', () => {
  assert.equal(fencedCancel(old, [{...old, request:'req-other'}]), null);
});
test('different SQL role cannot inherit a cancellation ticket', () => {
  assert.equal(fencedCancel(old, [{...old, role:'guardian_reader'}]), null);
});
