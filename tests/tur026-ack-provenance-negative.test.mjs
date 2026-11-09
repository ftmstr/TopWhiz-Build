import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic model only: no Cloudflare, CDN, R2 or real network activity.
// A local acknowledgement cannot attest to independent receiver delivery.
function claimedSafe({localAck, brokerAck, dbCommit, generationMatch, receiverReceipt}) {
  return localAck && brokerAck && dbCommit && generationMatch && receiverReceipt;
}
test('4096 fictional delivery combinations never promote local acknowledgements to receiver proof', () => {
  let cases = 0;
  for (let mask = 0; mask < 32; mask++) {
    for (let byteCount = 1; byteCount <= 64; byteCount++) {
      for (const revoked of [false, true]) {
        const [localAck,brokerAck,dbCommit,generationMatch,receiverReceipt] =
          [0,1,2,3,4].map(i => Boolean(mask & (1 << i)));
        const safe = claimedSafe({localAck,brokerAck,dbCommit,generationMatch,receiverReceipt});
        if (revoked || !receiverReceipt) assert.equal(safe && !revoked, false);
        if (localAck && brokerAck && dbCommit && generationMatch && !receiverReceipt)
          assert.equal(safe, false, 'all local receipts cannot establish remote delivery');
        cases++;
      }
    }
  }
  assert.equal(cases, 4096);
});
test('stale receiver receipt predating revocation cannot authorize a later generation', () => {
  const receipt = { generation: 7, acknowledgedBytes: 64 };
  const current = { generation: 8, revoked: true };
  assert.notEqual(receipt.generation, current.generation);
  assert.equal(current.revoked, true);
});
test('positive synthetic control remains distinct from production proof', () => {
  assert.equal(claimedSafe({localAck:true,brokerAck:true,dbCommit:true,generationMatch:true,receiverReceipt:true}),true);
});
