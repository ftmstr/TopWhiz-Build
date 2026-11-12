import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';

// Synthetic loopback-only media; no Cloudflare, R2, CDN or external IAM.
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
async function scenario(mode) {
  const revocation = gate(), started = gate(), firstByte = gate();
  let epoch = 1, serverStream;
  const server = http2.createServer();
  server.on('stream', (s, headers) => {
    if (headers[':path'] === '/health') { s.respond({':status': 200}); s.end('OK'); return; }
    serverStream = s;
    s.on('error', () => {});
    s.respond({':status': 200, 'cache-control': 'no-store'});
    s.write('HEAD');
    started.resolve();
    revocation.promise.then(() => {
      if (s.destroyed) return;
      if (mode === 'unsafe') s.end('TAIL');
      else s.close(http2.constants.NGHTTP2_CANCEL);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const client = http2.connect(`http://127.0.0.1:${server.address().port}`);
  client.on('error', () => {});
  try {
    const req = client.request({':path': '/media'});
    req.on('error', () => {});
    let body = '', rst = null;
    const ended = new Promise(r => {
      req.on('data', c => { body += c.toString(); if (body.includes('HEAD')) firstByte.resolve(); });
      req.on('close', () => { rst = req.rstCode; r(); });
    });
    req.end();
    await started.promise;
    await firstByte.promise;
    epoch = 2; // synthetic authority revocation ACK
    revocation.resolve();
    await ended;
    const health = client.request({':path': '/health'});
    health.on('error', () => {});
    let healthBody = '';
    const healthy = new Promise(r => { health.on('data', c => { healthBody += c.toString(); }); health.on('end', r); });
    health.end();
    await healthy;
    return {mode, body, postAckBytes: body.slice(4).length, rst, healthBody, epoch};
  } finally {
    revocation.resolve();
    client.destroy();
    serverStream?.destroy();
    await new Promise(r => server.close(r));
  }
}
test('TUR134 stream-scoped close after rights ACK preserves sibling HTTP2 stream', {timeout: 15000}, async () => {
  const unsafe = await scenario('unsafe'), guarded = await scenario('guarded');
  assert.equal(unsafe.body, 'HEADTAIL');
  assert.equal(unsafe.postAckBytes, 4);
  assert.equal(guarded.body, 'HEAD');
  assert.equal(guarded.postAckBytes, 0);
  assert.equal(unsafe.healthBody, 'OK');
  assert.equal(guarded.healthBody, 'OK');
  // Node may report rstCode=0 if close races an already-flushed END_STREAM.
  // Do not misrepresent the close() request as independently observed RST_STREAM.
  console.log(JSON.stringify({suite: 'TUR134_HTTP2_SCOPED_CLOSE', unsafe, guarded,
    physicalRstFrame: 'NOT_PROVEN', remoteReceiverLastByte: 'NOT_PROVEN',
    productionFix: 'NOT_IMPLEMENTED', issue22: 'OPEN', release: 'NO_GO'}));
});
