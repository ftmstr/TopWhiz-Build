// TUR049: Synthetic-only ACK identity canonicalization counterexamples. No production claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const digest = x => createHash('sha256').update(x).digest('hex');
const naive = x => Object.values(x).join('|');
const canonical = x => {
  const keys = ['publisher','generation','object','start','length','digest'];
  return Buffer.concat(keys.map(k => {
    const value = String(x[k]);
    const bytes = Buffer.from(value, 'utf8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(bytes.length);
    return Buffer.concat([prefix, bytes]);
  }));
};
const base = {publisher:'a',generation:'b',object:'media',start:'0',length:'8',digest:digest('payload')};
test('TUR049 naive delimiter collision remains an unsafe identity', () => {
  const a={...base,publisher:'a|b',generation:'c'};
  const b={...base,publisher:'a',generation:'b|c'};
  assert.equal(naive(a),naive(b));
  assert.notDeepEqual(canonical(a),canonical(b));
});
test('TUR049 canonical bytes distinguish Unicode normalization forms', () => {
  const a={...base,publisher:'é'};
  const b={...base,publisher:'e\u0301'};
  assert.notDeepEqual(canonical(a),canonical(b));
});
test('TUR049 generation must be included in ACK identity', () => {
  assert.notDeepEqual(canonical(base),canonical({...base,generation:'next'}));
});
test('TUR049 digest must be included in ACK identity', () => {
  assert.notDeepEqual(canonical(base),canonical({...base,digest:digest('different')}));
});
test('TUR049 matching local ACK never proves final receiver byte', () => {
  const ack={identity:digest(canonical(base)),localAccepted:true,remoteFinalByteVerified:false};
  assert.equal(ack.localAccepted,true);
  assert.equal(ack.remoteFinalByteVerified,false);
});
