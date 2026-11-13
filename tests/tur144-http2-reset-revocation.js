'use strict';
// TUR144: local HTTP/2 RST_STREAM and revoked epoch; no remote R2/CDN claims.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http2 = require('node:http2');
const { once } = require('node:events');

async function scenario(guarded) {
  let epoch = 1, resume, arrived, closed;
  let attempts = 0, forbidden = 0;
  const ready = new Promise(r => { arrived = r; });
  const closedReady = new Promise(r => { closed = r; });
  const gate = new Promise(r => { resume = r; });
  const server = http2.createServer();
  server.on('stream', async (stream, headers) => {
    if (headers[':path'] === '/health') {
      stream.respond({ ':status': 200 });
      stream.end('OK');
      return;
    }
    const snapshot = epoch;
    stream.respond({ ':status': 200 });
    stream.write('HEAD');
    arrived();
    stream.once('close', closed);
    await gate;
    // Count attempts rather than claiming the remote client received bytes.
    if (!guarded || (snapshot === epoch && !stream.destroyed && !stream.closed)) {
      attempts++;
      if (snapshot !== epoch || stream.closed || stream.destroyed) forbidden++;
      if (!stream.destroyed && !stream.closed) stream.write('TAIL');
    }
    if (!stream.destroyed && !stream.closed) stream.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = http2.connect('http://127.0.0.1:' + server.address().port);
  try {
    const media = client.request({ ':path': '/media' });
    media.on('data', () => {});
    media.on('error', () => {});
    media.end();
    await ready;
    media.close(http2.constants.NGHTTP2_CANCEL);
    await closedReady;
    epoch++;
    const health = client.request({ ':path': '/health' });
    let body = '';
    health.setEncoding('utf8');
    health.on('data', x => { body += x; });
    const ended = once(health, 'end');
    health.end();
    await ended;
    resume();
    // Server handler resumes in a subsequent microtask.
    await new Promise(resolve => setImmediate(resolve));
    return { attempts, forbidden, body };
  } finally {
    resume();
    client.close();
    await new Promise(resolve => server.close(resolve));
  }
}

test('TUR144 cancelled stream and revoked epoch reject stale continuation without affecting sibling', async () => {
  const unsafe = await scenario(false);
  const safe = await scenario(true);
  assert.equal(unsafe.forbidden, 1);
  assert.equal(unsafe.attempts, 1);
  assert.equal(safe.forbidden, 0);
  assert.equal(safe.attempts, 0);
  assert.equal(unsafe.body, 'OK');
  assert.equal(safe.body, 'OK');
  console.log('TUR144 unsafe stale attempt=1; guarded=0; actual post-reset remote delivery NOT_PROVEN');
});
