import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic counterexamples ONLY. No authenticated receipt or real network transport.
const weakAdmission = ({ generation, receipt }) =>
  generation === receipt.generation && receipt.acknowledgedBytes > 0;
const strictModel = ({ asset, publisher, generation, nonce, receipt }) =>
  receipt.asset === asset && receipt.publisher === publisher &&
  receipt.generation === generation && receipt.nonce === nonce &&
  receipt.acknowledgedBytes > 0;

test('generation-only receipt can be replayed across 64 unrelated assets', () => {
  for (let i = 1; i <= 64; i++) {
    const receipt = { asset: 'asset-A', publisher: 'publisher-A', generation: 7, nonce: 'nonce-A', acknowledgedBytes: i };
    assert.equal(weakAdmission({ generation: 7, receipt }), true);
    assert.equal(strictModel({ asset: 'asset-B-' + i, publisher: 'publisher-A', generation: 7, nonce: 'nonce-A', receipt }), false);
  }
});

test('generation-only receipt can be replayed across 64 independent publishers', () => {
  for (let i = 1; i <= 64; i++) {
    const receipt = { asset: 'asset-A', publisher: 'publisher-A', generation: 7, nonce: 'nonce-A', acknowledgedBytes: i };
    assert.equal(weakAdmission({ generation: 7, receipt }), true);
    assert.equal(strictModel({ asset: 'asset-A', publisher: 'publisher-B-' + i, generation: 7, nonce: 'nonce-A', receipt }), false);
  }
});

test('generation-only receipt fails to bind 64 request nonces', () => {
  for (let i = 1; i <= 64; i++) {
    const receipt = { asset: 'asset-A', publisher: 'publisher-A', generation: 7, nonce: 'nonce-old', acknowledgedBytes: i };
    assert.equal(weakAdmission({ generation: 7, receipt }), true);
    assert.equal(strictModel({ asset: 'asset-A', publisher: 'publisher-A', generation: 7, nonce: 'nonce-new-' + i, receipt }), false);
  }
});

test('even fully matching synthetic receipt cannot undo buffered post-revocation bytes', () => {
  for (let bytes = 1; bytes <= 64; bytes++) {
    const receipt = { asset: 'asset-A', publisher: 'publisher-A', generation: 7, nonce: 'nonce-A', acknowledgedBytes: bytes };
    assert.equal(strictModel({ asset: 'asset-A', publisher: 'publisher-A', generation: 7, nonce: 'nonce-A', receipt }), true);
    const bufferedAfterRevocation = Uint8Array.from({ length: bytes }, () => 0x41);
    assert.equal(bufferedAfterRevocation.byteLength, bytes);
    assert.ok(bufferedAfterRevocation.byteLength > 0);
  }
});

test('positive strict model is not an authenticated or final-byte proof', () => {
  const receipt = { asset: 'asset-A', publisher: 'publisher-A', generation: 7, nonce: 'nonce-A', acknowledgedBytes: 1 };
  assert.equal(strictModel({ ...receipt, receipt }), true);
});
