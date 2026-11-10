import test from 'node:test';
import assert from 'node:assert/strict';

// Deterministic negative model only. NOT the production CMS handler or Cloudflare.
const approved = (state, generation) => state.approved && state.generation === generation;
test('stale edge guardian can authorize after committed global revoke', () => {
  const global = {approved:true,generation:7};
  const edge = {...global};
  global.approved=false; global.generation=8; // committed before edge request
  assert.equal(approved(edge,7),true);
  assert.equal(approved(global,7),false);
});
test('fresh independent guardian read denies a withdrawn generation', () => {
  const guardian={approved:false,generation:8};
  assert.equal(approved(guardian,7),false);
});
test('fail-closed on missing guardian or denied SELECT', () => {
  const authorize = (read) => { try { const row=read(); return Boolean(row && approved(row,7)); } catch { return false; } };
  assert.equal(authorize(()=>null),false);
  assert.equal(authorize(()=>{throw Error('42501 permission denied')}),false);
});
test('post-check revoke cannot retract previously enqueued bytes', () => {
  const guardian={approved:true,generation:7};
  const queued=[];
  if (approved(guardian,7)) queued.push(Buffer.from('fictional'));
  guardian.approved=false; guardian.generation=8;
  assert.equal(queued.reduce((n,b)=>n+b.length,0),9);
  assert.equal(approved(guardian,7),false);
});
test('local send completion is not remote final-byte acknowledgment', () => {
  const local={queuedBytes:9,remoteAck:null};
  assert.equal(local.queuedBytes,9);
  assert.equal(local.remoteAck,null);
});
