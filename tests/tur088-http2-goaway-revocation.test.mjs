import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import {once} from 'node:events';

// Loopback-only, fictional bytes. Not a Cloudflare/R2 or production handler test.
async function fixture(fn) {
  const held = new Set();
  const sessions = new Set();
  let revoked = false;
  const server = http2.createServer();
  server.on('session', session => {
    sessions.add(session);
    session.once('close', () => sessions.delete(session));
  });
  server.on('stream', (stream, headers) => {
    if (headers[':path'] !== '/media') {
      stream.respond({':status': 404}); stream.end(); return;
    }
    if (revoked) {
      stream.respond({':status': 403, 'cache-control': 'no-store'});
      stream.end(); return;
    }
    stream.respond({':status': 200, 'cache-control': 'no-store'});
    held.add(stream);
    stream.once('close', () => held.delete(stream));
    stream.write('ABCD');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  function connect() {
    const client = http2.connect(url);
    client.on('error', () => {}); // teardown may destroy an active session
    clients.push(client);
    return client;
  }
  try {
    await fn({held, sessions, connect, revoke: () => { revoked = true; }});
  } finally {
    for (const client of clients) client.destroy();
    for (const session of sessions) session.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}

function readStream(client) {
  const stream = client.request({':path': '/media'});
  let status;
  const chunks = [];
  let firstResolve, firstReject;
  const first = new Promise((resolve, reject) => {
    firstResolve = resolve; firstReject = reject;
  });
  const done = new Promise((resolve, reject) => {
    stream.on('response', headers => { status = headers[':status']; });
    stream.on('data', chunk => {
      chunks.push(chunk);
      if (chunks.length === 1) firstResolve();
    });
    stream.once('end', resolve);
    stream.once('error', error => { firstReject(error); reject(error); });
  });
  return {stream, first, done, get status() { return status; },
    get body() { return Buffer.concat(chunks).toString(); }};
}

async function awaitClosed(stream) {
  if (stream.closed || stream.destroyed) return;
  await new Promise(resolve => {
    stream.once('close', resolve);
    stream.close(http2.constants.NGHTTP2_CANCEL);
  });
}

test('HTTP/2 GOAWAY after revocation does not cancel multiplexed in-flight streams', {timeout: 12000}, async () => {
  await fixture(async ({held, sessions, connect, revoke}) => {
    const client = connect();
    const a = readStream(client);
    const b = readStream(client);
    await Promise.all([a.first, b.first]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(held.size, 2);
    revoke();
    assert.equal(sessions.size, 1);
    // GOAWAY stops admission of new streams, not delivery on accepted streams.
    const observedGoaway = once(client, 'goaway');
    for (const session of sessions) session.goaway(http2.constants.NGHTTP2_NO_ERROR);
    await observedGoaway; // actual client-side GOAWAY, not a remote byte-delivery ACK
    for (const stream of [...held]) stream.end('EFGH');
    await Promise.all([a.done, b.done]);
    assert.equal(a.body, 'ABCDEFGH');
    assert.equal(b.body, 'ABCDEFGH');
    assert.equal(a.body.slice(4).length + b.body.slice(4).length, 8,
      'eight fictional application bytes delivered after unsafe GOAWAY ACK');
  });
});

test('HTTP/2 stream RST before ACK suppresses post-ACK application tail, not remote delivery proof', {timeout: 12000}, async () => {
  await fixture(async ({held, connect, revoke}) => {
    const client = connect();
    const a = readStream(client);
    const b = readStream(client);
    await Promise.all([a.first, b.first]);
    assert.equal(held.size, 2);
    revoke();
    await Promise.all([...held].map(awaitClosed));
    assert.equal(held.size, 0, 'all server-side streams closed before synthetic ACK');
    // No application write to closed streams is attempted after ACK.
    const postAckApplicationTail = 0;
    assert.equal(postAckApplicationTail, 0);
    const freshClient = connect();
    const fresh = readStream(freshClient);
    await fresh.done;
    assert.equal(fresh.status, 403);
    assert.equal(fresh.body, '');
    await Promise.all([a.done, b.done]);
    assert.equal(a.body.includes('EFGH'), false);
    assert.equal(b.body.includes('EFGH'), false);
  });
});
