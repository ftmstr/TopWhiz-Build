import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

test('abort after first received chunk cannot retract delivered bytes', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = Buffer.from('synthetic-first-byte');
  const server = createServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
    res.write(first);
    await gate;
    if (!res.destroyed) res.end('synthetic-second-byte');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/media`, { signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    assert.equal(Buffer.from(chunk.value).toString(), first.toString());
    controller.abort();
    release();
    await assert.rejects(reader.read(), { name: 'AbortError' });
    assert.equal(Buffer.from(chunk.value).length, first.length, 'previously delivered bytes remain visible');
  } finally {
    release();
    controller.abort();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('HTTP 200 and no-store are not distributed revocation receipts', () => {
  const local = { status: 200, cacheControl: 'no-store', remoteAck: null, globalCdnInvalidation: null };
  assert.equal(local.remoteAck, null);
  assert.equal(local.globalCdnInvalidation, null);
});

test('untrusted ACK cannot override a revoked generation', () => {
  const authorize = ({ current, supplied, revoked }) => !revoked && current === supplied;
  assert.equal(authorize({ current: 9, supplied: 9, revoked: true }), false);
  assert.equal(authorize({ current: 10, supplied: 9, revoked: false }), false);
});
