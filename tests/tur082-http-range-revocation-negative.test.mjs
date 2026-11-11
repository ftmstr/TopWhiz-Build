import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { once } from 'node:events';

// Deliberately unsafe controlled counterexample; not a secure media proxy.
test('two concurrent HTTP 206 ranges can deliver stale tail bytes after revocation', { timeout: 8000 }, async () => {
  const media = Buffer.from('ABCDEFGHIJKLMNOP');
  let releaseTail;
  const tailGate = new Promise(resolve => { releaseTail = resolve; });
  const server = createServer(async (req, res) => {
    const match = /^bytes=(0|8)-(7|15)$/.exec(req.headers.range ?? '');
    if (!match || Number(match[1]) + 7 !== Number(match[2])) {
      res.writeHead(416); res.end(); return;
    }
    const start = Number(match[1]);
    const part = media.subarray(start, start + 8);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${start + 7}/${media.length}`,
      'Content-Length': 8,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    res.write(part.subarray(0, 4));
    await tailGate;
    // Intentionally missing an authoritative generation check.
    res.end(part.subarray(4));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const state = { generation: 1, revoked: false };
  const clients = [];
  function range(start) {
    let firstSeen;
    const first = new Promise(resolve => { firstSeen = resolve; });
    const done = new Promise((resolve, reject) => {
      const request = get({ hostname: '127.0.0.1', port: server.address().port,
        path: '/media', headers: { Range: `bytes=${start}-${start + 7}` } }, response => {
        assert.equal(response.statusCode, 206);
        assert.equal(response.headers['content-range'], `bytes ${start}-${start + 7}/16`);
        const chunks = [];
        let lateBytes = 0;
        response.on('data', chunk => {
          chunks.push(chunk);
          if (state.revoked) lateBytes += chunk.length;
          else firstSeen();
        });
        response.on('end', () => resolve({ body: Buffer.concat(chunks), lateBytes }));
        response.on('error', reject);
      });
      clients.push(request);
      request.on('error', reject);
    });
    return { first, done };
  }
  try {
    const left = range(0);
    const right = range(8);
    await Promise.all([left.first, right.first]);
    state.revoked = true;
    state.generation = 2;
    releaseTail();
    const [a, b] = await Promise.all([left.done, right.done]);
    assert.equal(a.body.toString(), 'ABCDEFGH');
    assert.equal(b.body.toString(), 'IJKLMNOP');
    assert.equal(a.lateBytes, 4);
    assert.equal(b.lateBytes, 4);
    assert.equal(state.generation, 2);
  } finally {
    releaseTail();
    for (const request of clients) request.destroy();
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('a 206/no-store response or one range ACK is not a global revocation receipt', () => {
  const evidence = { status: 206, cacheControl: 'no-store', range0Ack: true,
    range8Ack: false, authenticatedReceiver: null, globalEdgePurge: null };
  assert.equal(evidence.authenticatedReceiver, null);
  assert.equal(evidence.globalEdgePurge, null);
  assert.equal(evidence.range8Ack, false);
});
