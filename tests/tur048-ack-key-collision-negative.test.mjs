import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic adversarial receipt-key model only; NOT a production authorization fix.
// TUR046's join(':') key is ambiguous when untrusted scope fields contain ':'.
const legacy = (publisher, generation, chunk) => [publisher, generation, chunk].join(':');
const canonical = (...parts) => parts.map(value => {
  const s = String(value);
  return Buffer.byteLength(s, 'utf8') + ':' + s;
}).join('');
const cases = [
  [['edge:a', 7, 0], ['edge', 'a:7', 0]],
  [['edge', '7:0', 'part'], ['edge:7', 0, 'part']],
  [['x:y', 'z', 'w'], ['x', 'y:z', 'w']]
];
for (const [index, [left, right]] of cases.entries()) {
  test('TUR048 legacy delimiter collision '+(index+1)+' cannot certify ACK scope', () => {
    assert.notDeepEqual(left, right);
    assert.equal(legacy(...left), legacy(...right));
    assert.notEqual(canonical(...left), canonical(...right));
  });
}
test('TUR048 length-prefix handles Unicode byte length without delimiter ambiguity', () => {
  const a = ['é:x', 1, 'chunk'];
  const b = ['é', 'x:1', 'chunk'];
  assert.equal(legacy(...a), legacy(...b));
  assert.notEqual(canonical(...a), canonical(...b));
  assert.equal(canonical('é').startsWith('2:'), true);
});
test('TUR048 even a collision-free local receipt is not remote final-byte proof', () => {
  const scope = canonical('edge', 7, 0);
  const state = { scope, localAck: true, revoked: true, remoteFinalByteProven: false };
  assert.equal(state.localAck, true);
  assert.equal(state.remoteFinalByteProven, false);
});
