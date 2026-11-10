import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Negative-only model: not a PostgreSQL permission boundary or production code.
function authorizeCancel(record, request) {
  if (!record || !request) return false;
  if (!record.active || record.revoked) return false;
  if (!Number.isSafeInteger(record.pid) || record.pid <= 0) return false;
  if (!Number.isSafeInteger(request.pid) || request.pid <= 0) return false;
  return record.pid === request.pid &&
    record.requestId === request.requestId &&
    record.lease === request.lease &&
    record.role === request.role &&
    record.connectionId === request.connectionId &&
    record.backendStart === request.backendStart;
}
const original = Object.freeze({
  pid: 4102, requestId: randomUUID(), lease: randomUUID(),
  role: 'media_reader', connectionId: randomUUID(),
  backendStart: '2026-11-10T20:00:00.000Z', active: true, revoked: false
});
test('exact tuple permits only a synthetic model match', () => {
  assert.equal(authorizeCancel(original, {...original}), true);
});
test('PID ABA after backend restart must fail', () => {
  assert.equal(authorizeCancel(original, {...original, backendStart:'2026-11-10T20:00:01.000Z'}), false);
});
test('pool checkout reuse with identical PID must fail', () => {
  assert.equal(authorizeCancel(original, {...original, connectionId:randomUUID()}), false);
});
test('stale lease and foreign request cannot cancel', () => {
  assert.equal(authorizeCancel(original, {...original, lease:randomUUID()}), false);
  assert.equal(authorizeCancel(original, {...original, requestId:randomUUID()}), false);
});
test('role mismatch, revocation and completed backend fail closed', () => {
  assert.equal(authorizeCancel(original, {...original, role:'guardian_reader'}), false);
  assert.equal(authorizeCancel({...original, revoked:true}, {...original}), false);
  assert.equal(authorizeCancel({...original, active:false}, {...original}), false);
});
test('malformed PIDs and absent evidence fail closed', () => {
  for(const pid of [-1, 0, NaN, 1.5, Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(authorizeCancel(original, {...original,pid}), false);
  }
  assert.equal(authorizeCancel(null, original), false);
  assert.equal(authorizeCancel(original, null), false);
});
test('negative control: PostgreSQL same-role pg_cancel_backend bypasses application tuple', () => {
  // Application-side tuple checks cannot constrain an independently authenticated
  // same-role SQL connection that directly invokes pg_cancel_backend(target_pid).
  const attacker = {pid: original.pid, role: original.role};
  assert.equal(authorizeCancel(original, attacker), false);
  assert.equal(attacker.pid, original.pid);
  // This test deliberately does NOT assert that PostgreSQL would deny the call.
});
