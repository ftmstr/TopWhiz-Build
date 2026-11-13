import { test } from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

async function exercise(mode) {
  const rights = new Map([['A', { epoch: 7, allowed: true, lease: 'L' }], ['B', { epoch: 11, allowed: true, lease: 'L' }]]);
  const gates = new Map();
  const server = http2.createServer();
  server.on('stream', async (stream, headers) => {
    const path = headers[':path'];
    if (path === '/health') { stream.respond({ ':status': 200 }); stream.end('OK'); return; }
    const tenant = path === '/a' ? 'A' : 'B';
    const captured = { ...rights.get(tenant) };
    let resume;
    const gate = new Promise(resolve => { resume = resolve; });
    gates.set(tenant, resume);
    stream.respond({ ':status': 200 });
    stream.write('HEAD');
    await gate;
    const current = rights.get(tenant);
    const permit = mode === 'lease-only'
      ? captured.lease === current.lease
      : current.allowed && captured.epoch === current.epoch && captured.lease === current.lease;
    stream.end(permit ? 'TAIL' : '');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = http2.connect(`http://127.0.0.1:${server.address().port}`);
  function request(path) {
    const stream = client.request({ ':path': path });
    let body = '';
    let headResolve;
    const head = new Promise(resolve => { headResolve = resolve; });
    stream.on('data', chunk => { body += chunk.toString(); if (body.includes('HEAD')) headResolve(); });
    const done = once(stream, 'end');
    stream.end();
    return { head, done, body: () => body };
  }
  try {
    const a = request('/a');
    const b = request('/b');
    await Promise.all([a.head, b.head]);
    const old = rights.get('A');
    rights.set('A', { epoch: old.epoch + 1, allowed: false, lease: 'X' });
    rights.set('A', { epoch: old.epoch + 1, allowed: false, lease: 'L' }); // ABA
    gates.get('A')();
    gates.get('B')();
    await Promise.all([a.done, b.done]);
    const health = request('/health');
    await health.done;
    return { aPostAckBytes: Buffer.byteLength(a.body().slice(4)), bTail: b.body().slice(4), health: health.body() };
  } finally {
    client.close();
    await new Promise(resolve => server.close(resolve));
  }
}

test('TUR141: tenant-scoped epoch prevents ABA leak without cancelling unaffected sibling stream', async () => {
  assert.deepEqual(await exercise('lease-only'), { aPostAckBytes: 4, bTail: 'TAIL', health: 'OK' });
  assert.deepEqual(await exercise('epoch-fenced'), { aPostAckBytes: 0, bTail: 'TAIL', health: 'OK' });
});
