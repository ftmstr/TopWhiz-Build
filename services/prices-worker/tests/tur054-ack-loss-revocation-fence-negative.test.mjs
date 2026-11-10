import test from 'node:test';
import assert from 'node:assert/strict';

// TUR054: deliberately synthetic negative evidence; NOT a transport or R2 implementation.
function deferred() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
function ledger() {
  const accepted = new Set();
  return { reserve(key) { if (accepted.has(key)) return false; accepted.add(key); return true; } };
}
test('ACK loss after reservation leaves durable local ledger ambiguous', () => {
  const store = ledger();
  assert.equal(store.reserve('publisher:g7:ack1'), true);
  const transportAckLost = true;
  assert.equal(transportAckLost, true);
  assert.equal(store.reserve('publisher:g7:ack1'), false);
  // A durable reservation prevents replay, not proof of client delivery.
});
test('two independent ledgers accept the same ACK despite local atomicity', () => {
  const east = ledger(), west = ledger();
  assert.equal(east.reserve('publisher:g7:ack1'), true);
  assert.equal(west.reserve('publisher:g7:ack1'), true);
});
test('revocation after last authorization cannot retract already queued bytes', async () => {
  const gate = deferred();
  let rights = true;
  const authorized = rights;
  const queued = Buffer.from('FICTIONAL-PNG-BYTES');
  const response = (async () => { await gate.promise; return authorized ? queued : Buffer.alloc(0); })();
  rights = false;
  gate.release();
  const delivered = await response;
  assert.equal(rights, false);
  assert.equal(delivered.length, queued.length);
});
test('server completion and local ACK cannot establish final receiver byte', () => {
  const serverCompleted = true, localAckValid = true, receiverObservedLastByte = false;
  assert.equal(serverCompleted && localAckValid, true);
  assert.equal(receiverObservedLastByte, false);
});
