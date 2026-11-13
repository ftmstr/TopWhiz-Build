import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

test('TUR145 revoked generation blocks delayed continuation and preserves sibling', async () => {
  const server = http2.createServer();
  let epoch = 1, release;
  const gate = new Promise(resolve => { release = resolve; });
  let attempted = 0, prevented = 0, handlerError;
  server.on('stream', (stream, headers) => {
    if (headers[':path'] === '/health') {
      stream.respond({ ':status': 200 }); stream.end('SIBLING_OK'); return;
    }
    const captured = epoch;
    stream.respond({ ':status': 200 });
    stream.write('HEAD');
    void (async () => {
      try {
        await gate;
        if (captured !== epoch || stream.destroyed || stream.closed) {
          prevented++; stream.end(); return;
        }
        attempted++; stream.end('TAIL');
      } catch (err) { handlerError = err; }
    })();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = http2.connect(`http://127.0.0.1:${server.address().port}`);
  try {
    const media = client.request({ ':path': '/media' });
    let mediaBody = '';
    const first = new Promise(resolve => media.once('data', resolve));
    media.setEncoding('utf8');
    media.on('data', chunk => { mediaBody += chunk; });
    const ended = once(media, 'end');
    await first;
    assert.equal(mediaBody, 'HEAD');
    epoch = 2; // synthetic revocation acknowledgement
    release();
    await ended;
    const health = client.request({ ':path': '/health' });
    health.setEncoding('utf8');
    let healthBody = '';
    health.on('data', chunk => { healthBody += chunk; });
    health.end();
    await once(health, 'end');
    assert.equal(mediaBody, 'HEAD');
    assert.equal(healthBody, 'SIBLING_OK');
    assert.equal(attempted, 0);
    assert.equal(prevented, 1);
    assert.equal(handlerError, undefined);
  } finally {
    release(); client.close();
    await new Promise(resolve => server.close(resolve));
  }
});
