// TUR051: synthetic ACK freshness/replay boundary, not a production receiver protocol.
// Negative evidence: authenticated local receipts do NOT prove final-byte network delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

const key = Buffer.from('tur051-fictional-test-key-only');
const encode = (fields) => Buffer.concat(fields.map((f) => {
  const value = Buffer.from(String(f), 'utf8');
  const size = Buffer.alloc(4); size.writeUInt32BE(value.length);
  return Buffer.concat([size, value]);
}));
const mac = (fields) => createHmac('sha256', key).update(encode(fields)).digest();
const make = (overrides = {}) => ({
  publisher: 'fictional-publisher', generation: 7, object: 'fictional.png',
  receiver: 'fictional-receiver', digest: 'fictional-digest', start: 0, length: 32,
  issuedAt: 1000, expiresAt: 1100, nonce: 'nonce-001', ...overrides,
});
const fields = (r) => [r.publisher, r.generation, r.object, r.receiver, r.digest,
  r.start, r.length, r.issuedAt, r.expiresAt, r.nonce];
function verify(r, tag, now, seen) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(r.issuedAt) ||
      !Number.isSafeInteger(r.expiresAt) || r.expiresAt <= r.issuedAt ||
      now < r.issuedAt || now >= r.expiresAt) return false;
  if (!Buffer.isBuffer(tag) || tag.length !== 32) return false;
  if (!timingSafeEqual(mac(fields(r)), tag)) return false;
  const replayKey = encode([r.publisher, r.receiver, r.generation, r.nonce]).toString('hex');
  if (seen.has(replayKey)) return false;
  seen.add(replayKey);
  return true;
}

test('fresh synthetic MAC is accepted once within the bounded interval', () => {
  const r = make(); const seen = new Set();
  assert.equal(verify(r, mac(fields(r)), 1000, seen), true);
  assert.equal(seen.size, 1);
});
test('replayed signed receipt is rejected by shared replay ledger', () => {
  const r = make(); const tag = mac(fields(r)); const seen = new Set();
  assert.equal(verify(r, tag, 1050, seen), true);
  assert.equal(verify(r, tag, 1051, seen), false);
});
test('expiry boundary is exclusive even for authentic MAC', () => {
  const r = make(); const tag = mac(fields(r));
  assert.equal(verify(r, tag, 1099, new Set()), true);
  assert.equal(verify(r, tag, 1100, new Set()), false);
});
test('not-yet-valid receipt is rejected even for authentic MAC', () => {
  const r = make(); assert.equal(verify(r, mac(fields(r)), 999, new Set()), false);
});
test('tampered expiry, issuedAt and nonce cannot reuse authentic MAC', () => {
  const r = make(); const tag = mac(fields(r));
  for (const change of [{expiresAt: 9999}, {issuedAt: 900}, {nonce: 'nonce-002'}])
    assert.equal(verify(make(change), tag, 1050, new Set()), false);
});
test('malformed expiry window and malformed MAC fail closed', () => {
  const r = make({expiresAt: 1000});
  assert.equal(verify(r, mac(fields(r)), 1000, new Set()), false);
  assert.equal(verify(make(), Buffer.from('bad'), 1050, new Set()), false);
});
test('isolated replay ledgers both accept same signed receipt: distributed bypass', () => {
  const r = make(); const tag = mac(fields(r));
  assert.equal(verify(r, tag, 1050, new Set()), true);
  assert.equal(verify(r, tag, 1050, new Set()), true);
});
test('valid local ACK cannot establish receiver final-byte delivery', () => {
  const r = make(); const localLedger = new Set();
  const remoteBytesObserved = 0;
  assert.equal(verify(r, mac(fields(r)), 1050, localLedger), true);
  assert.equal(remoteBytesObserved, 0);
  assert.notEqual(remoteBytesObserved, r.length);
});
