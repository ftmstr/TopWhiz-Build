import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';

// TUR133: real loopback HTTP/2 GOAWAY semantics, synthetic authority only.
// GOAWAY stops new streams, not existing DATA streams or CDN receiver bytes.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return {promise, resolve, reject};
}

async function scenario(mode) {
  const rights = {epoch: 1, available: true};
  const release = deferred();
  const first = deferred();
  const server = http2.createServer();
  let streamSession;
  server.on('stream', stream => {
    streamSession = stream.session;
    stream.respond({':status': 200, 'cache-control': 'no-store'});
    stream.write('HEAD');
    release.promise.then(() => {
      if (stream.destroyed) return;
      const allowed = mode === 'unsafe' || (rights.available && rights.epoch === 1);
      stream.end(allowed ? 'TAIL' : '');
    }).catch(e => stream.destroy(e));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = http2.connect(`http://127.0.0.1:${server.address().port}`);
  client.on('error', () => {});
  try {
    const req = client.request({':path': '/synthetic-asset'});
    req.on('error', () => {});
    let body = '';
    const completed = new Promise((resolve, reject) => {
      req.on('data', chunk => { body += chunk.toString(); if (body.includes('HEAD')) first.resolve(); });
      req.on('end', resolve);
      req.on('error', reject);
    });
    req.end();
    await first.promise;
    const sawGoaway = deferred();
    client.once('goaway', (code, lastStreamID) => sawGoaway.resolve({code, lastStreamID}));
    streamSession.goaway(http2.constants.NGHTTP2_NO_ERROR);
    const frame = await sawGoaway.promise;
    assert.equal(frame.code, http2.constants.NGHTTP2_NO_ERROR);
    assert.throws(() => client.request({':path': '/new'}), e => e.code === 'ERR_HTTP2_GOAWAY_SESSION');
    rights.epoch = 2; // synthetic revocation ACK after GOAWAY receipt
    if (mode === 'outage') rights.available = false;
    release.resolve();
    await completed;
    return {mode, body, postAckBytes: body.slice(4).length, goawayCode: frame.code};
  } finally {
    release.resolve();
    client.destroy();
    streamSession?.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}

test('TUR133 HTTP2 GOAWAY cannot retract an existing stream after revocation ACK', {timeout:15000}, async () => {
  const unsafe = await scenario('unsafe');
  assert.equal(unsafe.body, 'HEADTAIL');
  assert.equal(unsafe.postAckBytes, 4);
  const guarded = await scenario('guarded');
  assert.equal(guarded.body, 'HEAD');
  assert.equal(guarded.postAckBytes, 0);
  const outage = await scenario('outage');
  assert.equal(outage.body, 'HEAD');
  assert.equal(outage.postAckBytes, 0);
  console.log(JSON.stringify({suite:'TUR133_REAL_HTTP2_GOAWAY_POST_ACK_STREAM', unsafe, guarded, outage,
    authority:'SYNTHETIC_LOCAL', remoteR2CdnLastByte:'NOT_PROVEN',
    productionFix:'NOT_IMPLEMENTED', issue22:'OPEN', release:'NO_GO'}));
});
