import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic model only: acknowledgements are not evidence of remote byte retraction.
function classify({localEof, brokerAck, dbCommit, remoteDelivered, revoked, staleCache}) {
  const apparentSuccess = localEof && brokerAck && dbCommit;
  const remoteExposure = revoked && (remoteDelivered > 0 || staleCache);
  return {apparentSuccess, remoteExposure, safeToPublish: !remoteExposure && !revoked};
}
test('all combinations of local success signals fail to prove post-revocation safety', () => {
  let cases = 0;
  for (let mask=0;mask<8;mask++) for (let bytes=1;bytes<=64;bytes++) {
    const r=classify({localEof:!!(mask&1),brokerAck:!!(mask&2),dbCommit:!!(mask&4),remoteDelivered:bytes,revoked:true,staleCache:false});
    assert.equal(r.remoteExposure,true);
    assert.equal(r.safeToPublish,false);
    cases++;
  }
  assert.equal(cases,512);
});
test('even all local acknowledgements cannot clear stale CDN replay', () => {
  const r=classify({localEof:true,brokerAck:true,dbCommit:true,remoteDelivered:0,revoked:true,staleCache:true});
  assert.equal(r.apparentSuccess,true);
  assert.equal(r.remoteExposure,true);
  assert.equal(r.safeToPublish,false);
});
test('positive control: no revocation, no cache replay and no remote bytes', () => {
  const r=classify({localEof:true,brokerAck:true,dbCommit:true,remoteDelivered:0,revoked:false,staleCache:false});
  assert.equal(r.safeToPublish,true);
});
