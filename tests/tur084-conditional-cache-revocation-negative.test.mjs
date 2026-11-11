import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';

// Intentionally unsafe local HTTP counterexamples. Not a production authorization design.
const etag = '"synthetic-object-v1"';
const media = Buffer.from('ABCDEFGH');

async function withServer(handler, run) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await run(server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function read(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: '/media', method: 'GET', headers, timeout: 3000 }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('HTTP read timed out')));
    req.on('error', reject);
    req.end();
  });
}

test('conditional 304 after rights revocation does not invalidate an already held client cache', { timeout: 8000 }, async () => {
  let revoked = false;
  let generation = 1;
  await withServer((req, res) => {
    if (req.url !== '/media') { res.writeHead(404); res.end(); return; }
    // Unsafe: object ETag is consulted without the current rights generation.
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=3600' });
      res.end();
      return;
    }
    res.writeHead(200, { ETag: etag, 'Cache-Control': 'public, max-age=3600' });
    res.end(media);
  }, async port => {
    const original = await read(port);
    assert.equal(original.status, 200);
    assert.equal(original.body.toString(), 'ABCDEFGH');
    const cachedBytes = Buffer.from(original.body);
    revoked = true;
    generation = 2;
    const conditional = await read(port, { 'If-None-Match': etag });
    assert.equal(conditional.status, 304);
    assert.equal(conditional.body.length, 0, '304 itself delivered zero body bytes');
    assert.equal(revoked, true);
    assert.equal(generation, 2);
    assert.equal(cachedBytes.toString(), 'ABCDEFGH', 'eight bytes remain available to the local client');
    assert.equal(conditional.headers.etag, original.headers.etag, 'unsafe validator ignores rights generation');
  });
});

test('If-Range returns a physical stale HTTP 206 body after rights revocation', { timeout: 8000 }, async () => {
  let revoked = false;
  let generation = 1;
  await withServer((req, res) => {
    if (req.url !== '/media') { res.writeHead(404); res.end(); return; }
    // Unsafe: a matching content validator bypasses the rights generation fence.
    if (req.headers['if-range'] === etag && req.headers.range === 'bytes=4-7') {
      res.writeHead(206, { ETag: etag, 'Content-Range': 'bytes 4-7/8', 'Content-Length': 4, 'Cache-Control': 'no-store' });
      res.end(media.subarray(4));
      return;
    }
    res.writeHead(200, { ETag: etag, 'Cache-Control': 'no-store' });
    res.end(media);
  }, async port => {
    const original = await read(port);
    assert.equal(original.status, 200);
    assert.equal(original.body.length, 8);
    revoked = true;
    generation = 2;
    const stale = await read(port, { Range: 'bytes=4-7', 'If-Range': etag });
    assert.equal(revoked, true);
    assert.equal(generation, 2);
    assert.equal(stale.status, 206);
    assert.equal(stale.headers['content-range'], 'bytes 4-7/8');
    assert.equal(stale.headers['cache-control'], 'no-store');
    assert.equal(stale.body.toString(), 'EFGH');
    assert.equal(stale.body.length, 4, 'four physical post-revocation response bytes');
  });
});
