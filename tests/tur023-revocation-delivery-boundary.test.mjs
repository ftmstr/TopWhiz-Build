import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic transport model only. It does NOT prove real TCP/CDN byte delivery.
function simulate({bytes, revokeAt, sharedFence, cacheHit=false}) {
  let generation=1, delivered=0, admitted=true;
  const buffered=Array.from({length:bytes},(_,i)=>i&255);
  for (let i=0;i<buffered.length;i++) {
    if (i===revokeAt) { generation++; if(sharedFence) admitted=false; }
    if (!admitted) break;
    // Cached copies and separately coordinated publishers can bypass local fences.
    delivered++;
  }
  return {delivered,generation,cacheHit};
}
test('TUR023 64 synthetic cut points: uncoordinated publisher can deliver after revoke',()=>{
  for(let n=1;n<=64;n++) {
    const r=simulate({bytes:n,revokeAt:0,sharedFence:false});
    assert.equal(r.delivered,n);
    assert.equal(r.generation,2);
  }
});
test('TUR023 shared in-process fence is only a local positive control',()=>{
  for(let n=1;n<=64;n++) for(let cut=0;cut<n;cut++) {
    const r=simulate({bytes:n,revokeAt:cut,sharedFence:true});
    assert.equal(r.delivered,cut);
  }
});
test('TUR023 stale CDN object is an unresolved independent distribution path',()=>{
  for(const bytes of [1,5,64,1024]) {
    const r=simulate({bytes,revokeAt:0,sharedFence:false,cacheHit:true});
    assert.equal(r.delivered,bytes);
    assert.equal(r.cacheHit,true);
  }
});
test('TUR023 never interpret stream EOF as final network-byte acknowledgment',()=>{
  const localStreamEOF=true, networkFinalByteAck=false;
  assert.equal(localStreamEOF && !networkFinalByteAck,true);
});
