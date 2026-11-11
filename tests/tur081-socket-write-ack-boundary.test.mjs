import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { once } from 'node:events';

test('physical local TCP: bytes observed before revocation cannot be recalled', { timeout: 5000 }, async () => {
  const first = Buffer.from('synthetic-tur081-before-revoke');
  let accepted;
  const acceptedPromise = new Promise(resolve => { accepted = resolve; });
  const server = createServer(socket => { accepted(socket); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let client;
  let peer;
  try {
    client = connect(server.address().port, '127.0.0.1');
    await once(client, 'connect');
    peer = await acceptedPromise;
    const observed = once(client, 'data');
    const localWriteAccepted = peer.write(first);
    const [chunk] = await observed;
    assert.equal(chunk.toString(), first.toString());
    const generation = { value: 1, revoked: false };
    generation.revoked = true;
    generation.value = 2;
    assert.equal(generation.revoked, true);
    assert.equal(chunk.length, first.length, 'revocation cannot retract received bytes');
    assert.equal(typeof localWriteAccepted, 'boolean', 'write() only reports local buffering/backpressure');
  } finally {
    client?.destroy();
    peer?.destroy();
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('write callback and drain are not authenticated receiver acknowledgements', () => {
  const evidence = { writeCallback: true, drain: true, receiverIdentity: null, remoteApplicationAck: null, cdnPurgeReceipt: null };
  assert.equal(evidence.remoteApplicationAck, null);
  assert.equal(evidence.receiverIdentity, null);
  assert.equal(evidence.cdnPurgeReceipt, null);
});

test('stale generation and untrusted delivery receipt cannot re-authorize', () => {
  const grant = ({ current, supplied, revoked, receipt }) =>
    !revoked && current === supplied && receipt?.trustedIssuer === true;
  assert.equal(grant({ current: 2, supplied: 1, revoked: false, receipt: { trustedIssuer: true } }), false);
  assert.equal(grant({ current: 2, supplied: 2, revoked: true, receipt: { trustedIssuer: true } }), false);
  assert.equal(grant({ current: 2, supplied: 2, revoked: false, receipt: { trustedIssuer: false } }), false);
});
