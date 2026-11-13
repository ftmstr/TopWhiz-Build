import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';

const gate = () => { let open; const promise = new Promise(resolve => { open = resolve; }); return {promise, open}; };
async function run(guarded) {
  const started = gate(), release = gate(), closed = gate();
  let epoch = 1, attempted = 0, staleBytes = 0;
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    stream.on('error', () => {});
    if (headers[':path'] === '/sibling') {
      stream.respond({':status': 200}); stream.end('SIBLING_OK'); return;
    }
    const snapshot = epoch;
    stream.respond({':status': 200, 'cache-control': 'no-store'});
    stream.write('HEAD');
    started.open();
    stream.on('close', () => closed.open());
    void release.promise.then(() => {
      attempted++;
      if (guarded && snapshot !== epoch) return;
      if (!stream.closed && !stream.destroyed) { staleBytes += 4; stream.end('TAIL'); }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = http2.connect('http://127.0.0.1:' + server.address().port);
  client.on('error', () => {});
  try {
    const media = client.request({':path': '/media'}); media.on('error', () => {});
    let mediaBody = '';
    const first = gate();
    const mediaDone = new Promise(resolve => {
      media.on('data', chunk => { mediaBody += chunk.toString(); first.open(); });
      media.on('close', resolve);
    });
    media.end(); await started.promise; await first.promise;
    const sibling = client.request({':path': '/sibling'}); sibling.on('error', () => {});
    let siblingBody = '';
    const siblingDone = new Promise(resolve => {
      sibling.on('data', chunk => { siblingBody += chunk.toString(); });
      sibling.on('end', resolve);
    });
    sibling.end();
    epoch = 2; // synthetic revocation ACK; not a remote IAM proof
    if (guarded) { media.close(http2.constants.NGHTTP2_CANCEL); await closed.promise; }
    release.open();
    await Promise.all([mediaDone, siblingDone]);
    await new Promise(resolve => setImmediate(resolve));
    return {mediaBody, siblingBody, attempted, staleBytes};
  } finally {
    release.open(); client.destroy(); await new Promise(resolve => server.close(resolve));
  }
}
test('TUR136 same HTTP2 session: revoked media cannot leak while sibling completes', {timeout: 15000}, async () => {
  const unsafe = await run(false);
  const guarded = await run(true);
  assert.deepEqual(unsafe, {mediaBody:'HEADTAIL', siblingBody:'SIBLING_OK', attempted:1, staleBytes:4});
  assert.deepEqual(guarded, {mediaBody:'HEAD', siblingBody:'SIBLING_OK', attempted:1, staleBytes:0});
  console.log(JSON.stringify({suite:'TUR136_HTTP2_SIBLING_STREAM',unsafe,guarded,remoteLastByte:'NOT_PROVEN',physicalRstFrame:'NOT_PROVEN',productionFix:'NOT_IMPLEMENTED',issue22:'OPEN',release:'NO_GO'}));
});
