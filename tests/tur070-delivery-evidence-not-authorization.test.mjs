import test from 'node:test';
import assert from 'node:assert/strict';

// TUR070: proof classification is deliberately NOT a media-delivery authorization.
// A local write/drain callback is not an end-to-end remote receipt.
function classifyDeliveryEvidence({ localWrite, drain, peerAck, revoked, edgeGeneration, authoritativeGeneration }) {
  if (!Number.isSafeInteger(edgeGeneration) || !Number.isSafeInteger(authoritativeGeneration)) return 'DENY_INVALID_GENERATION';
  if (revoked || edgeGeneration !== authoritativeGeneration) return 'DENY_REVOKED_OR_STALE';
  if (!localWrite) return 'NO_LOCAL_WRITE';
  if (!drain) return 'LOCAL_WRITE_ONLY';
  if (!peerAck) return 'LOCAL_DRAIN_NOT_REMOTE_DELIVERY';
  return 'UNTRUSTED_PEER_ACK_NOT_AUTHORIZATION';
}
const base = {localWrite:true,drain:true,peerAck:false,revoked:false,edgeGeneration:8,authoritativeGeneration:8};
test('local write and drain never prove final remote byte',()=>assert.equal(classifyDeliveryEvidence(base),'LOCAL_DRAIN_NOT_REMOTE_DELIVERY'));
test('untrusted ACK does not prove authorized delivery',()=>assert.equal(classifyDeliveryEvidence({...base,peerAck:true}),'UNTRUSTED_PEER_ACK_NOT_AUTHORIZATION'));
test('revocation supersedes previously queued and ACK-marked bytes',()=>assert.equal(classifyDeliveryEvidence({...base,revoked:true,peerAck:true}),'DENY_REVOKED_OR_STALE'));
test('cross-isolate stale generation fails closed',()=>assert.equal(classifyDeliveryEvidence({...base,edgeGeneration:7}),'DENY_REVOKED_OR_STALE'));
test('invalid generation fails closed',()=>assert.equal(classifyDeliveryEvidence({...base,edgeGeneration:NaN}),'DENY_INVALID_GENERATION'));
test('local write without drain cannot claim delivery',()=>assert.equal(classifyDeliveryEvidence({...base,drain:false}),'LOCAL_WRITE_ONLY'));
test('no write cannot claim delivery',()=>assert.equal(classifyDeliveryEvidence({...base,localWrite:false}),'NO_LOCAL_WRITE'));
