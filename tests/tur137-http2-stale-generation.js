'use strict';
// TUR137: localhost HTTP/2 stale generation continuation, synthetic only.
const http2 = require('node:http2');
const assert = require('node:assert/strict');
const { once } = require('node:events');
async function scenario(guarded) {
  let generation = 1, ack = false, release, headReady;
  const headSent = new Promise(resolve => { headReady = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const server = http2.createServer();
  server.on('stream', stream => {
    if (stream.headers[':path'] === '/sibling') {
      stream.respond({ ':status': 200 }); stream.end('SIBLING_OK'); return;
    }
    const captured = generation;
    stream.respond({ ':status': 200 });
    stream.write('HEAD'); headReady();
    void (async () => {
      await gate;
      if (!guarded || (captured === generation && !ack)) stream.write('TAIL');
      stream.end();
    })().catch(err => stream.destroy(err));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = http2.connect('http://127.0.0.1:' + server.address().port);
  async function read(path) {
    const stream = client.request({ ':path': path });
    let data = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => { data += chunk; });
    await once(stream, 'end');
    return data;
  }
  try {
    const media = read('/media');
    // Yield until server has emitted HEAD; then acknowledge a generation change.
    await headSent;
    generation++; ack = true; release();
    const [body, sibling] = await Promise.all([media, read('/sibling')]);
    return { body, sibling };
  } finally {
    client.close(); await new Promise(resolve => server.close(resolve));
  }
}
(async () => {
  const unsafe = await scenario(false);
  const safe = await scenario(true);
  assert.equal(unsafe.body, 'HEADTAIL');
  assert.equal(safe.body, 'HEAD');
  assert.equal(unsafe.sibling, 'SIBLING_OK');
  assert.equal(safe.sibling, 'SIBLING_OK');
  console.log('TUR137 PASS: unsafe 4 post-ACK synthetic bytes; guarded 0; siblings healthy');
})().catch(err => { console.error(err); process.exitCode = 1; });
