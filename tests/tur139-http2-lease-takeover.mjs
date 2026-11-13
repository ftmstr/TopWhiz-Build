import { test } from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

async function scenario(guarded) {
  const state = {generation: 7, lease: 1, revoked: false};
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const server = http2.createServer();
  server.on('stream', async (stream, headers) => {
    if (headers[':path'] === '/health') {
      stream.respond({':status': 200}); stream.end('SIBLING_OK'); return;
    }
    const captured = {generation: state.generation, lease: state.lease};
    stream.respond({':status': 200}); stream.write('HEAD');
    await barrier;
    if (!guarded || (!state.revoked && captured.generation === state.generation && captured.lease === state.lease)) stream.end('TAIL');
    else stream.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = http2.connect(`http://127.0.0.1:${server.address().port}`);
  try {
    const media = client.request({':path':'/media'});
    let body = ''; let signalHead;
    const gotHead = new Promise(resolve => { signalHead = resolve; });
    media.on('data', chunk => {body += chunk.toString(); if (body.includes('HEAD')) signalHead();});
    const done = once(media, 'end'); media.end(); await gotHead;
    // Synthetic independent durable revocation ACK and concurrent lease takeover.
    state.revoked = true; state.generation++; state.lease++;
    const health = client.request({':path':'/health'}); let sibling = '';
    health.on('data', chunk => sibling += chunk.toString());
    const healthDone = once(health, 'end'); health.end(); await healthDone;
    release(); await done;
    return {postAckBytes: body.slice(4).length, sibling};
  } finally {client.close(); server.close();}
}

test('TUR139: lease takeover plus durable revocation ACK fences stale HTTP2 continuation while preserving sibling', async () => {
  const unsafe = await scenario(false);
  const safe = await scenario(true);
  assert.deepEqual(unsafe, {postAckBytes: 4, sibling:'SIBLING_OK'});
  assert.deepEqual(safe, {postAckBytes: 0, sibling:'SIBLING_OK'});
});
