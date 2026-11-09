import test from 'node:test';
import assert from 'node:assert/strict';

// Negative-only transport model: ACKs are untrusted and are not a distributed fence.
// Every byte is fictional; this is not Cloudflare, a real receiver, or an IAM proof.
function receiverLedger() {
  const sent = new Map();
  const acknowledgements = new Set();
  return {
    send(publisher, generation, chunk, payload) {
      const key = [publisher, generation, chunk].join(':');
      sent.set(key, Buffer.from(payload));
      return key;
    },
    acknowledge(key) { acknowledgements.add(key); },
    accepted(key) { return acknowledgements.has(key); },
    hasSent(key) { return sent.has(key); }
  };
}
test('TUR046 negative: replayed ACK is not proof of fresh generation receipt', () => {
  const ledger = receiverLedger();
  const oldKey = ledger.send('publisher-A', 1, 0, 'fictional-old');
  ledger.acknowledge(oldKey);
  const newKey = ledger.send('publisher-A', 2, 0, 'fictional-new');
  assert.equal(ledger.accepted(oldKey), true);
  assert.equal(ledger.accepted(newKey), false);
});
test('TUR046 negative: publisher A ACK cannot certify publisher B', () => {
  const ledger = receiverLedger();
  const a = ledger.send('publisher-A', 7, 0, 'fictional-A');
  const b = ledger.send('publisher-B', 7, 0, 'fictional-B');
  ledger.acknowledge(a);
  assert.equal(ledger.accepted(b), false);
  assert.equal(ledger.hasSent(b), true);
});
test('TUR046 negative: local ACK can precede revocation while final remote delivery remains unknown', () => {
  const state = { locallyAcked: false, revoked: false, remotelyDelivered: false };
  state.locallyAcked = true;
  state.revoked = true;
  assert.equal(state.locallyAcked, true);
  assert.equal(state.revoked, true);
  assert.equal(state.remotelyDelivered, false);
});
test('TUR046 negative: duplicate ACK after revoke cannot imply zero post-revoke bytes', () => {
  const state = { ackCount: 0, revoked: false, queuedBytes: 8 };
  state.ackCount++;
  state.revoked = true;
  state.ackCount++;
  assert.equal(state.ackCount, 2);
  assert.equal(state.queuedBytes, 8);
});
