import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic adversarial boundary model; deliberately NOT a network/R2 implementation.
// A server-side enqueue/stream close cannot certify client receipt or revocation safety.
function publisher() {
  let revoked = false;
  const queued = [];
  return {
    revoke() { revoked = true; },
    admit(bytes) { if (revoked) return false; queued.push(bytes); return true; },
    drain() { return queued.splice(0); },
    get revoked() { return revoked; }
  };
}
test('TUR045 negative: accepted bytes can drain after revocation', () => {
  const p = publisher();
  assert.equal(p.admit(Buffer.from('fictional-before-revoke')), true);
  p.revoke();
  assert.equal(p.admit(Buffer.from('fresh-request')), false);
  assert.equal(p.drain().length, 1, 'queued pre-revocation bytes remain available');
});
test('TUR045 negative: server completion does not imply remote receiver ACK', () => {
  const transport = { serverClosed: false, remoteAck: false, bytesQueued: 0 };
  transport.bytesQueued = 8;
  transport.serverClosed = true;
  assert.equal(transport.serverClosed, true);
  assert.equal(transport.remoteAck, false);
  assert.equal(transport.bytesQueued, 8);
});
test('TUR045 negative: local cancellation cannot revoke independent queue', () => {
  const a = publisher(), b = publisher();
  assert.equal(a.admit(Buffer.from('a')), true);
  assert.equal(b.admit(Buffer.from('b')), true);
  a.revoke(); a.drain();
  assert.equal(b.drain().length, 1);
});
