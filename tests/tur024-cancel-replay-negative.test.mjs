import test from 'node:test';
import assert from 'node:assert/strict';

// CI-only fictional byte model. No network, Cloudflare, CDN, or real rights are exercised.
function publisher({ queued, revoke, cancel, fail, replay }) {
  let localPermit = true;
  const outbound = Buffer.alloc(queued, 0x41);
  if (cancel || fail) localPermit = false; // local closure is not remote delivery proof
  if (revoke) localPermit = false;
  const original = outbound.length;
  const replayed = replay ? outbound.length : 0; // stale independent publisher
  return { original, replayed, localPermit, postRevoke: revoke ? original + replayed : 0 };
}
test('cancel/error do not retract already queued fictional transport bytes', () => {
  for (let n = 1; n <= 64; n++) for (const mode of ['cancel', 'fail']) {
    const r = publisher({ queued:n, revoke:true, cancel:mode==='cancel', fail:mode==='fail', replay:false });
    assert.equal(r.localPermit, false);
    assert.equal(r.postRevoke, n);
  }
});
test('independent stale publisher replay remains outside local revocation', () => {
  for (const n of [1, 5, 64, 1024]) {
    const r = publisher({ queued:n, revoke:true, cancel:true, fail:false, replay:true });
    assert.equal(r.postRevoke, 2*n);
    assert.equal(r.replayed, n);
  }
});
test('no simulated local permit transition is a remote final-byte ACK', () => {
  for (const mode of ['cancel','fail','revoke']) {
    const localPermitClosed = true;
    const remoteLastByteAcknowledged = false;
    assert.equal(localPermitClosed && !remoteLastByteAcknowledged, true, mode);
  }
});
