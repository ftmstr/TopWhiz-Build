import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

// Local transport regression, NOT an R2/CDN final-receiver guarantee.
test('TUR146 shared HTTP2 session: revocation fences two stale streams, fresh stream remains usable', async () => {
  const server = http2.createServer();
  let generation = 1;
  let resume;
  const hold = new Promise(resolve => { resume = resolve; });
  const observations = { staleWrites: 0, staleDenied: 0, freshWrites: 0 };
  server.on('stream', (stream, headers) => {
    const path = headers[':path'];
    if (path === '/health') { stream.respond({ ':status': 200 }); stream.end('SIBLING_OK'); return; }
    const captured = generation;
    stream.respond({ ':status': 200 });
    stream.write('HEAD');
    void (async () => {
      await hold;
      if (captured !== generation || stream.destroyed || stream.closed) {
        observations.staleDenied++;
        if (!stream.destroyed && !stream.closed) stream.end();
        return;
      }
      if (captured === 1) observations.staleWrites++;
      else observations.freshWrites++;
      stream.end('TAIL');
    })();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = http2.connect(`http://127.0.0.1:${server.address().port}`);
  const receive = (path) => {
    const stream = client.request({ ':path': path });
    stream.setEncoding('utf8');
    let body = '';
    let first;
    const firstByte = new Promise(resolve => { first = resolve; });
    stream.on('data', chunk => { body += chunk; first(); });
    stream.end();
    return { firstByte, ended: once(stream, 'end'), body: () => body };
  };
  try {
    const a = receive('/media/a'), b = receive('/media/b');
    await Promise.all([a.firstByte, b.firstByte]);
    assert.equal(a.body(), 'HEAD'); assert.equal(b.body(), 'HEAD');
    generation = 2; // synthetic revocation ACK, before either stale continuation
    const fresh = receive('/media/fresh');
    await fresh.firstByte;
    resume();
    await Promise.all([a.ended, b.ended, fresh.ended]);
    const sibling = receive('/health'); await sibling.ended;
    assert.deepEqual([a.body(), b.body(), fresh.body(), sibling.body()], ['HEAD', 'HEAD', 'HEADTAIL', 'SIBLING_OK']);
    assert.deepEqual(observations, { staleWrites: 0, staleDenied: 2, freshWrites: 1 });
  } finally {
    resume(); client.close();
    await new Promise(resolve => server.close(resolve));
  }
});
