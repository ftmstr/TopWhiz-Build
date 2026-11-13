import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

// Local HTTP/2 authority-outage counterexample. NOT distributed R2/CDN last-byte proof.
test('TUR147: revoked stream plus authority outage must fail closed; unsafe cached permit leaks', async () => {
  const server = http2.createServer();
  let authority = 'valid';
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const attempts = { unsafe: 0, guarded: 0, denied: 0 };
  server.on('stream', (stream, headers) => {
    const path = headers[':path'];
    if (path === '/health') {
      stream.respond({ ':status': 200 });
      stream.end('HEALTH_OK');
      return;
    }
    const capturedPermit = authority === 'valid';
    stream.respond({ ':status': 200 });
    stream.write('HEAD');
    void (async () => {
      await gate;
      // Deliberately unsafe baseline: cached pre-outage permit.
      if (path === '/unsafe' && capturedPermit) {
        attempts.unsafe++;
        stream.end('TAIL');
        return;
      }
      // Guarded baseline: unknown authority is never treated as allow.
      if (authority !== 'valid' || !capturedPermit || stream.closed || stream.destroyed) {
        attempts.denied++;
        if (!stream.closed && !stream.destroyed) stream.end();
        return;
      }
      attempts.guarded++;
      stream.end('TAIL');
    })();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = http2.connect('http://127.0.0.1:' + server.address().port);
  const receive = path => {
    const stream = client.request({ ':path': path });
    stream.setEncoding('utf8');
    let body = '';
    let first;
    const firstData = new Promise(resolve => { first = resolve; });
    stream.on('data', chunk => { body += chunk; first(); });
    const ended = once(stream, 'end');
    stream.end();
    return { firstData, ended, body: () => body };
  };
  try {
    const unsafe = receive('/unsafe'), guarded = receive('/guarded');
    await Promise.all([unsafe.firstData, guarded.firstData]);
    assert.equal(unsafe.body(), 'HEAD');
    assert.equal(guarded.body(), 'HEAD');
    authority = undefined; // simulated revocation + authority partition; never a permit
    release();
    await Promise.all([unsafe.ended, guarded.ended]);
    const sibling = receive('/health');
    await sibling.ended;
    assert.deepEqual([unsafe.body(), guarded.body(), sibling.body()], ['HEADTAIL', 'HEAD', 'HEALTH_OK']);
    assert.deepEqual(attempts, { unsafe: 1, guarded: 0, denied: 1 });
  } finally {
    release();
    client.close();
    await new Promise(resolve => server.close(resolve));
  }
});
