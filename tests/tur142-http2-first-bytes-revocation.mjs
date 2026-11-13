import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

async function scenario(protectedMode) {
  let epoch = 7;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let headerAcknowledged;
  const headersSeen = new Promise(resolve => { headerAcknowledged = resolve; });
  const server = http2.createServer();
  server.on('stream', async (stream, headers) => {
    if (headers[':path'] === '/health') {
      stream.respond({ ':status': 200 });
      stream.end('SIBLING_OK');
      return;
    }
    const authorizedEpoch = epoch;
    stream.respond({ ':status': 200, 'content-type': 'application/octet-stream' });
    stream.write('HEAD');
    await gate;
    if (!protectedMode || authorizedEpoch === epoch) stream.end('TAIL');
    else stream.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = http2.connect(`http://127.0.0.1:${server.address().port}`);
  try {
    const request = client.request({ ':path': '/media' });
    let payload = '';
    request.on('data', chunk => {
      payload += chunk.toString();
      if (payload.includes('HEAD')) headerAcknowledged();
    });
    const ended = once(request, 'end');
    request.end();
    await headersSeen;
    epoch += 1; // synthetic revocation ACK after the first body bytes
    release();
    await ended;
    const health = client.request({ ':path': '/health' });
    let healthBody = '';
    health.on('data', c => { healthBody += c.toString(); });
    const healthEnded = once(health, 'end');
    health.end();
    await healthEnded;
    return { payload, healthBody };
  } finally {
    client.close();
    await new Promise(resolve => server.close(resolve));
  }
}

test('TUR142 HTTP2 already-delivered bytes cannot be recalled; post-ACK tail is fenced', async () => {
  const unsafe = await scenario(false);
  const safe = await scenario(true);
  assert.equal(unsafe.payload, 'HEADTAIL');
  assert.equal(safe.payload, 'HEAD');
  assert.equal(unsafe.healthBody, 'SIBLING_OK');
  assert.equal(safe.healthBody, 'SIBLING_OK');
  assert.equal(unsafe.payload.length - 4, 4);
  assert.equal(safe.payload.length - 4, 0);
  console.log('TUR142 NEGATIVE: 4 already-delivered bytes irrevocable; unsafe post-ACK=4, protected post-ACK=0; localhost only');
});
