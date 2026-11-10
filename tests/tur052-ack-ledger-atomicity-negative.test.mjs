// TUR052: deterministic, synthetic ACK replay ledger race evidence. No live services.
import test from 'node:test';
import assert from 'node:assert/strict';

function naiveLedger() {
  const seen = new Set();
  return { check: key => !seen.has(key), record: key => seen.add(key) };
}
function atomicLedger() {
  const seen = new Set();
  return { reserve: key => seen.has(key) ? false : (seen.add(key), true) };
}
const receipt = 'synthetic:publisher-A:generation-7:nonce-123';

test('split check-then-record admits two concurrent consumers of the same ACK', () => {
  const ledger = naiveLedger();
  const a = ledger.check(receipt);
  const b = ledger.check(receipt);
  ledger.record(receipt);
  ledger.record(receipt);
  assert.deepEqual([a, b], [true, true]); // negative evidence; NOT a secure outcome
});
test('single-ledger atomic reservation permits exactly one consumer', () => {
  const ledger = atomicLedger();
  assert.deepEqual([ledger.reserve(receipt), ledger.reserve(receipt)], [true, false]);
});
test('independent atomic ledgers still admit the same signed ACK', () => {
  const isolateA = atomicLedger();
  const isolateB = atomicLedger();
  assert.deepEqual([isolateA.reserve(receipt), isolateB.reserve(receipt)], [true, true]);
});
test('process restart with non-durable ledger re-admits an ACK', () => {
  const beforeRestart = atomicLedger();
  assert.equal(beforeRestart.reserve(receipt), true);
  const afterRestart = atomicLedger();
  assert.equal(afterRestart.reserve(receipt), true);
});
test('reservation without durable delivery outcome is ambiguous after transport failure', () => {
  const ledger = atomicLedger();
  assert.equal(ledger.reserve(receipt), true);
  const transportAck = undefined; // synthetic lost transport acknowledgement
  assert.equal(transportAck, undefined);
  assert.equal(ledger.reserve(receipt), false);
  // Neither reservation nor denial proves remote final-byte delivery.
});
test('local atomic reservation does not prove remote final-byte receipt', () => {
  const ledger = atomicLedger();
  const reserved = ledger.reserve(receipt);
  const remoteLastByteReceived = false;
  assert.equal(reserved, true);
  assert.equal(remoteLastByteReceived, false);
});
