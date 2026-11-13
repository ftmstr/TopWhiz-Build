import { test } from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

async function exercise(mode) {
  // Disposable in-memory authority only: lease ABA (A -> B -> A) must not restore revoked rights.
  const authority = { epoch: 41, lease: 'A', allowed: true };
  let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  const server = http2.createServer();
  server.on('stream', async (stream, headers) => {
    if (headers[':path'] === '/health') {
      stream.respond({ ':status': 200 }); stream.end('SIBLING_OK'); return;
    }
    const captured = { epoch: authority.epoch, lease: authority.lease };
    stream.respond({ ':status': 200 }); stream.write('HEAD');
    await gate;
    // A lease-only check is vulnerable when a lease identifier is recycled.
    const permitted = mode === 'lease-only'
      ? captured.lease === authority.lease
      : authority.allowed && captured.epoch === authority.epoch && captured.lease === authority.lease;
    if (permitted) stream.end('TAIL');
    else stream.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = http2.connect('http://127.0.0.1:' + server.address().port);
  try {
    const media = client.request({ ':path': '/media' });
    let body = '';
    let notify;
    const headReceived = new Promise(resolve => { notify = resolve; });
    media.on('data', chunk => {
      body += chunk.toString();
      if (body.includes('HEAD')) notify();
    });
    const mediaDone = once(media, 'end');
    media.end();
    await headReceived;
    authority.allowed = false; authority.epoch = 42; authority.lease = 'B';
    // Stale lease A is recycled without restoring the rights epoch.
    authority.lease = 'A';
    const sibling = client.request({ ':path': '/health' });
    let healthBody = '';
    sibling.on('data', chunk => { healthBody += chunk.toString(); });
    const siblingDone = once(sibling, 'end');
    sibling.end();
    await siblingDone;
    resume();
    await mediaDone;
    return { postAckBytes: Buffer.byteLength(body.slice(4)), sibling: healthBody };
  } finally {
    client.close();
    await new Promise(resolve => server.close(resolve));
  }
}

test('TUR140 local HTTP2: recycled lease ABA cannot bypass monotonic rights epoch', async () => {
  assert.deepEqual(await exercise('lease-only'), { postAckBytes: 4, sibling: 'SIBLING_OK' });
  assert.deepEqual(await exercise('epoch-fenced'), { postAckBytes: 0, sibling: 'SIBLING_OK' });
});
