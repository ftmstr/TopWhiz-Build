import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

// TUR148: stale authority ALLOW response arriving AFTER revocation must not resurrect a stream.
// Local synthetic model only; NOT proof of remote R2/CDN final-byte delivery.
test('TUR148 delayed pre-revocation ALLOW reply cannot override a newer revoke epoch', async () => {
  const server = http2.createServer();
  let epoch = 7;
  let release;
  const delayedReply = new Promise(resolve => { release = resolve; });
  const writes = { unsafe: 0, guarded: 0 };
  server.on('stream', (stream, headers) => {
    const path = headers[':path'];
    if (path === '/health') { stream.respond({ ':status': 200 }); stream.end('OK'); return; }
    const requestedEpoch = epoch;
    stream.respond({ ':status': 200 });
    stream.write('HEAD');
    void (async () => {
      await delayedReply;
      // An old ALLOW response arrives late, after epoch changed.
      const staleAllow = { allowed: true, epoch: requestedEpoch };
      if (path === '/unsafe' && staleAllow.allowed) {
        writes.unsafe++;
        stream.end('TAIL');
      } else if (staleAllow.allowed && staleAllow.epoch === epoch && !stream.closed && !stream.destroyed) {
        writes.guarded++;
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
    const s = client.request({ ':path': path });
    s.setEncoding('utf8');
    let body = '';
    let first;
    const firstData = new Promise(resolve => { first = resolve; });
    s.on('data', chunk => { body += chunk; first(); });
    const end = once(s, 'end');
    s.end();
    return { firstData, end, body: () => body };
  }
  try {
    const unsafe = request('/unsafe');
    const guarded = request('/guarded');
    await Promise.all([unsafe.firstData, guarded.firstData]);
    assert.equal(unsafe.body(), 'HEAD');
    assert.equal(guarded.body(), 'HEAD');
    epoch = 8; // revoke ACK committed before stale authority reply
    release();
    await Promise.all([unsafe.end, guarded.end]);
    const health = request('/health');
    await health.end;
    assert.deepEqual([unsafe.body(), guarded.body(), health.body()], ['HEADTAIL', 'HEAD', 'OK']);
    assert.deepEqual(writes, { unsafe: 1, guarded: 0 });
  } finally {
    release();
    client.close();
    await new Promise(resolve => server.close(resolve));
  }
});
