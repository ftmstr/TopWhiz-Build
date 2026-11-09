import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic negative evidence only. No real receiver, R2, CDN or distributed fence.
// An ACK is a claim about a bounded context, never proof of final network delivery.
const receipt = ({publisher, generation, object, offset, length, digest}) =>
  Object.freeze({publisher, generation, object, offset, length, digest});
const sameClaim = (a,b) => ['publisher','generation','object','offset','length','digest']
  .every(key => a[key] === b[key]);
const deliveryProven = (_claim) => false; // no independent receiver evidence

const original = receipt({publisher:'edge-a',generation:7,object:'synthetic.png',
  offset:0,length:16,digest:'fictional-digest-1'});

for (const [name, change] of [
  ['publisher mismatch', {publisher:'edge-b'}],
  ['generation replay', {generation:8}],
  ['object substitution', {object:'other.png'}],
  ['range offset shift', {offset:8}],
  ['range truncation', {length:8}],
  ['digest substitution', {digest:'fictional-digest-2'}]
]) {
  test('TUR047 rejects ACK claim scope: '+name, () => {
    const requested = receipt({...original,...change});
    assert.equal(sameClaim(original,requested),false);
    assert.equal(deliveryProven(original),false);
  });
}
test('TUR047 exact matching local ACK still cannot prove final receiver byte',()=>{
  assert.equal(sameClaim(original,{...original}),true);
  assert.equal(deliveryProven(original),false);
});
test('TUR047 duplicated ACK does not upgrade receiver delivery proof',()=>{
  const duplicate=[original,original,original];
  assert.equal(duplicate.every(x=>sameClaim(x,original)),true);
  assert.equal(duplicate.some(deliveryProven),false);
});
