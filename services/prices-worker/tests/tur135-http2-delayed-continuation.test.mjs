import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
const deferred = () => { let release; const promise = new Promise(r => { release = r; }); return {promise, release}; };
async function scenario(guarded) {
  const entered = deferred(), resume = deferred(), canceled = deferred(), firstData = deferred();
  let epoch = 1, writes = 0, staleAttempt = 0, staleAccepted = 0;
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    stream.on('error', () => {});
    if (headers[':path'] === '/health') { stream.respond({':status': 200}); stream.end('OK'); return; }
    const capturedEpoch = epoch;
    stream.respond({':status': 200, 'cache-control': 'no-store'});
    stream.write('HEAD'); writes += 4;
    entered.release();
    void resume.promise.then(() => {
      staleAttempt++;
      if (guarded && (capturedEpoch !== epoch || stream.destroyed || stream.closed)) return;
      if (!stream.destroyed && !stream.closed) { stream.end('TAIL'); staleAccepted += 4; }
    });
    stream.on('close', () => canceled.release());
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const client = http2.connect(`http://127.0.0.1:${server.address().port}`);
  client.on('error', () => {});
  try {
    const req = client.request({':path': '/media'}); req.on('error', () => {});
    let body = '';
    const ended = new Promise(r => {req.on('data', c => { body += c.toString(); firstData.release(); }); req.on('close', r);});
    req.end(); await entered.promise; await firstData.promise;
    epoch = 2; // synthetic revocation ACK
    if (guarded) { req.close(http2.constants.NGHTTP2_CANCEL); await canceled.promise; }
    resume.release(); await ended;
    await new Promise(r => setImmediate(r));
    const health = client.request({':path': '/health'}); health.on('error', () => {});
    let healthy = ''; const done = new Promise(r => {health.on('data', c => healthy += c); health.on('end', r);});
    health.end(); await done;
    return {body, epoch, staleAttempt, staleAccepted, healthy, writes};
  } finally { resume.release(); client.destroy(); await new Promise(r => server.close(r)); }
}
test('TUR135 delayed continuation cannot resurrect canceled media stream; sibling survives', {timeout:15000}, async () => {
  const unsafe = await scenario(false), guarded = await scenario(true);
  assert.equal(unsafe.body, 'HEADTAIL'); assert.equal(unsafe.staleAccepted, 4);
  assert.equal(guarded.body, 'HEAD'); assert.equal(guarded.staleAccepted, 0);
  assert.equal(guarded.staleAttempt, 1); assert.equal(guarded.healthy, 'OK');
  console.log(JSON.stringify({suite:'TUR135_HTTP2_DELAYED_CONTINUATION',unsafe,guarded,physicalRstFrame:'NOT_PROVEN',remoteLastByte:'NOT_PROVEN',productionFix:'NOT_IMPLEMENTED',issue22:'OPEN',release:'NO_GO'}));
});
