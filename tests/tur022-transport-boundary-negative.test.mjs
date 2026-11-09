import test from 'node:test';
import assert from 'node:assert/strict';

// Negative evidence: a PostgreSQL permit is not a network-delivery acknowledgement.
// All bytes are fictional; no Cloudflare, R2, CDN, or customer content is accessed.
function makeTransport() {
  const buffered = [];
  let revoked = false;
  let permit = true;
  return {
    enqueue(bytes) { assert.equal(permit, true); buffered.push(bytes); },
    finishLocalStream() { permit = false; },
    revoke() { revoked = true; },
    flush() { return { revoked, delivered: buffered.reduce((n, b) => n + b.length, 0) }; }
  };
}
test('local stream completion cannot prove last network byte', () => {
  const transport = makeTransport();
  transport.enqueue(Buffer.from('FICTIONAL'));
  transport.finishLocalStream();
  transport.revoke();
  const result = transport.flush();
  assert.equal(result.revoked, true);
  assert.equal(result.delivered, 9); // negative counterexample, NOT security PASS
});
test('every transport buffer size 1..64 retains post-local-completion gap', () => {
  for (let size = 1; size <= 64; size++) {
    const transport = makeTransport();
    transport.enqueue(Buffer.alloc(size, 0x41));
    transport.finishLocalStream();
    transport.revoke();
    assert.equal(transport.flush().delivered, size);
  }
});
test('separate publishers cannot be fenced by one publisher local state', () => {
  const a = makeTransport(), b = makeTransport();
  b.enqueue(Buffer.from('BYPASS'));
  a.revoke();
  b.finishLocalStream();
  assert.equal(b.flush().delivered, 6);
});
