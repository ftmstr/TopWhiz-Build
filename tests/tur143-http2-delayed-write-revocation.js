'use strict';
// TUR143: localhost HTTP/2 delayed write callback after a synthetic revocation ACK.
// This is not an R2/CDN physical last-byte proof.
const http2 = require('node:http2');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');

async function scenario(guarded) {
  let generation = 1;
  let revokeAck;
  const revoked = new Promise(resolve => { revokeAck = resolve; });
  let releaseContinuation;
  const continuation = new Promise(resolve => { releaseContinuation = resolve; });
  const server = http2.createServer();
  server.on('stream', async (stream, headers) => {
    if (headers[':path'] === '/health') {
      stream.respond({ ':status': 200 });
      stream.end('SIBLING_OK');
      return;
    }
    const capturedGeneration = generation;
    stream.respond({ ':status': 200 });
    stream.write('HEAD');
    await continuation;
    // Continuation runs only after the synthetic authority ACK.
    if (!guarded || capturedGeneration === generation) stream.write('TAIL');
    stream.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const client = http2.connect('http://127.0.0.1:' + port);
  try {
    const media = client.request({ ':path': '/media' });
    media.setEncoding('utf8');
    let body = '';
    let headSeen;
    const headReady = new Promise(resolve => { headSeen = resolve; });
    media.on('data', chunk => { body += chunk; if (body.includes('HEAD')) headSeen(); });
    const mediaDone = once(media, 'end');
    media.end();
    await headReady;
    generation += 1;
    revokeAck();
    await revoked;
    const health = client.request({ ':path': '/health' });
    health.setEncoding('utf8');
    let healthBody = '';
    health.on('data', chunk => { healthBody += chunk; });
    const healthDone = once(health, 'end');
    health.end();
    releaseContinuation();
    await Promise.all([mediaDone, healthDone]);
    return { body, healthBody };
  } finally {
    client.close();
    await new Promise(resolve => server.close(resolve));
  }
}

test('TUR143 revocation ACK fences delayed HTTP2 write continuation and preserves sibling', async () => {
  const unsafe = await scenario(false);
  const safe = await scenario(true);
  assert.equal(unsafe.body, 'HEADTAIL');
  assert.equal(safe.body, 'HEAD');
  assert.equal(unsafe.healthBody, 'SIBLING_OK');
  assert.equal(safe.healthBody, 'SIBLING_OK');
  console.log('TUR143 local HTTP2 unsafe post-ACK=4 bytes, guarded post-ACK=0 bytes; pre-ACK HEAD irrevocable; R2/CDN NOT_PROVEN');
});
