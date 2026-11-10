// TUR050: synthetic receiver-ACK authentication boundary; no real network or R2 guarantee.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const key = randomBytes(32);
const otherKey = randomBytes(32);
const fields = ['publisher', 'generation', 'object', 'start', 'length', 'digest', 'receiver'];
const base = Object.freeze({publisher:'publisher-a',generation:'7',object:'media-1',start:'0',length:'8',digest:'sha256:abc',receiver:'client-a'});
function encode(record) {
  return Buffer.concat(fields.map(field => {
    const bytes = Buffer.from(String(record[field]), 'utf8');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    return Buffer.concat([size, bytes]);
  }));
}
function mac(record, secret=key) { return createHmac('sha256', secret).update('TOPWHIZ-TUR050-ACK-v1\0').update(encode(record)).digest(); }
function verify(record, signature, secret=key) {
  if (!Buffer.isBuffer(signature) || signature.length !== 32) return false;
  return timingSafeEqual(mac(record, secret), signature);
}
test('TUR050 unauthenticated ACK claim can be forged without a receiver secret', () => {
  const forged={...base,claimedFinalByteReceived:true};
  assert.equal(forged.claimedFinalByteReceived,true);
  assert.equal(Object.hasOwn(forged,'signature'),false);
});
test('TUR050 authenticated scope rejects cross-receiver substitution', () => {
  const signature=mac(base);
  assert.equal(verify(base,signature),true);
  assert.equal(verify({...base,receiver:'client-b'},signature),false);
});
test('TUR050 authenticated scope rejects generation and publisher substitution', () => {
  const signature=mac(base);
  assert.equal(verify({...base,generation:'8'},signature),false);
  assert.equal(verify({...base,publisher:'publisher-b'},signature),false);
});
test('TUR050 authenticated scope rejects object, range and digest substitution', () => {
  const signature=mac(base);
  for (const changed of [{object:'media-2'},{start:'1'},{length:'7'},{digest:'sha256:def'}])
    assert.equal(verify({...base,...changed},signature),false);
});
test('TUR050 wrong key, malformed tag and truncated tag fail closed', () => {
  const signature=mac(base);
  assert.equal(verify(base,signature,otherKey),false);
  assert.equal(verify(base,signature.subarray(0,31)),false);
  assert.equal(verify(base,'not-a-buffer'),false);
});
test('TUR050 even valid local MAC is not remote final-byte evidence', () => {
  const signature=mac(base);
  assert.equal(verify(base,signature),true);
  const evidence={locallySigned:true,independentReceiverAttestation:false,remoteFinalByteVerified:false};
  assert.equal(evidence.independentReceiverAttestation,false);
  assert.equal(evidence.remoteFinalByteVerified,false);
});
