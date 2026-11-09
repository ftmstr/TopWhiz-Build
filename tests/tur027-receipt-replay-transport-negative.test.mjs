import test from 'node:test';
import assert from 'node:assert/strict';

// Fictional bytes and receipts only. This models a negative safety boundary,
// not a Cloudflare/R2 implementation or a network-level acknowledgment.
function localAdmission({ generation, revoked, receipt }) {
  return !revoked && receipt.generation === generation && receipt.acknowledgedBytes > 0;
}
function remoteDelivery({ bufferedBytes, revokedAfterAdmission }) {
  return { bytes: bufferedBytes, unauthorizedAfterRevocation: revokedAfterAdmission && bufferedBytes > 0 };
}
test('stale receipt replay is rejected across 64 monotonic generations', () => {
  for (let generation = 2; generation <= 65; generation++) {
    const receipt = { generation: generation - 1, acknowledgedBytes: 64 };
    assert.equal(localAdmission({generation,revoked:false,receipt}),false);
  }
});
test('even matching receipt cannot retract buffered bytes after revoke', () => {
  let cases = 0;
  for (let bytes = 1; bytes <= 64; bytes++) {
    const receipt = {generation: 9, acknowledgedBytes: bytes};
    assert.equal(localAdmission({generation:9,revoked:false,receipt}),true);
    const observed = remoteDelivery({bufferedBytes:bytes,revokedAfterAdmission:true});
    assert.equal(observed.unauthorizedAfterRevocation,true);
    assert.equal(observed.bytes,bytes);
    cases++;
  }
  assert.equal(cases,64);
});
test('two independent publishers retain uncoordinated delivery gap', () => {
  const publisherA = {generation:4,revoked:true};
  const publisherB = {generation:4,bufferedBytes:17};
  assert.equal(localAdmission({...publisherA,receipt:{generation:4,acknowledgedBytes:17}}),false);
  assert.equal(remoteDelivery({bufferedBytes:publisherB.bufferedBytes,revokedAfterAdmission:true}).bytes,17);
});
test('revoked generation never admits even matching receipt', () => {
  for (let bytes=1;bytes<=64;bytes++) assert.equal(localAdmission({generation:8,revoked:true,receipt:{generation:8,acknowledgedBytes:bytes}}),false);
});
test('positive synthetic admission control is not production authorization', () => {
  assert.equal(localAdmission({generation:8,revoked:false,receipt:{generation:8,acknowledgedBytes:1}}),true);
});
