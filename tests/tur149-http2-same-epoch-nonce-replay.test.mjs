import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

// TUR149 synthetic negative regression: rights lease nonce can rotate while epoch remains unchanged.
// A comparison of epoch alone is insufficient to reject a delayed permit from the old lease.
// Not proof of distributed R2/CDN last receiver byte or real operator IAM.
test('TUR149 stale ALLOW replay at same epoch must fail nonce fence', async () => {
  const server = http2.createServer();
  const authority = { epoch: 8, nonce: 'lease-A' };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const attempts = { unsafe: 0, guarded: 0 };
  server.on('stream', (stream, headers) => {
    const path = headers[':path'];
    if (path === '/health') {
      stream.respond({ ':status': 200 });
      stream.end('OK');
      return;
    }
    const permit = { allowed: true, epoch: authority.epoch, nonce: authority.nonce };
    stream.respond({ ':status': 200 });
    stream.write('HEAD');
    void (async () => {
      await gate;
      const epochOnly = permit.allowed && permit.epoch === authority.epoch;
      const fenced = epochOnly && permit.nonce === authority.nonce && !stream.closed && !stream.destroyed;
      if (path === '/unsafe' && epochOnly) {
        attempts.unsafe++;
        stream.end('TAIL');
      } else if (path === '/guarded' && fenced) {
        attempts.guarded++;
        stream.end('TAIL');
      } else {
        stream.end();
      }
    })();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = http2.connect('http://127.0.0.1:' + server.address().port);
  function request(path) {
    const stream = client.request({ ':path': path });
    stream.setEncoding('utf8');
    let body = '';
    let firstResolve;
    const firstData = new Promise(resolve => { firstResolve = resolve; });
    stream.on('data', chunk => { body += chunk; firstResolve(); });
    const end = once(stream, 'end');
    stream.end();
    return { firstData, end, body: () => body };
  }
  try {
    const unsafe = request('/unsafe');
    const guarded = request('/guarded');
    await Promise.all([unsafe.firstData, guarded.firstData]);
    assert.equal(unsafe.body(), 'HEAD');
    assert.equal(guarded.body(), 'HEAD');
    // Simulated revocation/lease transfer ACK: epoch unchanged, nonce rotated.
    authority.nonce = 'lease-B';
    release();
    await Promise.all([unsafe.end, guarded.end]);
    const health = request('/health');
    await health.end;
    assert.deepEqual([unsafe.body(), guarded.body(), health.body()], ['HEADTAIL', 'HEAD', 'OK']);
    assert.deepEqual(attempts, { unsafe: 1, guarded: 0 });
  } finally {
    release();
    client.close();
    await new Promise(resolve => server.close(resolve));
  }
});
