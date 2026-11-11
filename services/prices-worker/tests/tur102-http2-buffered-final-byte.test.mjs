import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

// Synthetic loopback HTTP/2 transport evidence only. Client-side pause/resume
// controls application consumption, NOT the time a byte crossed the network.
const { NGHTTP2_CANCEL } = http2.constants;

async function fixture(mode) {
  let epoch = 1;
  let available = true;
  let active = null;
  const server = http2.createServer();
  server.on('stream', stream => {
    active = stream;
    stream.respond({ ':status': 200, 'content-type': 'application/octet-stream' });
    stream.write('HEAD');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const session = http2.connect('http://127.0.0.1:' + server.address().port);
  const stream = session.request({ ':method': 'GET', ':path': '/synthetic-media' });
  const chunks = [];
  let status;
  let ended = false;
  let cancelled = false;
  let failure = null;
  stream.on('response', h => { status = h[':status']; });
  stream.on('data', chunk => chunks.push(chunk.toString()));
  stream.on('end', () => { ended = true; });
  stream.on('aborted', () => { cancelled = true; });
  stream.on('error', error => { failure = error; });
  const first = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('first DATA timeout')), 5000);
    function received() {
      clearTimeout(timeout);
      stream.off('error', errored);
      resolve();
    }
    function errored(error) {
      clearTimeout(timeout);
      stream.off('data', received);
      reject(error);
    }
    stream.once('data', received);
    stream.once('error', errored);
  });
  void first;
  assert.equal(status, 200);
  assert.deepEqual(chunks, ['HEAD']);
  return {
    mode, stream, chunks,
    pause: () => stream.pause(),
    resume: () => stream.resume(),
    revoke: () => { epoch = 2; return { acknowledged: true, epoch }; },
    outage: () => { available = false; return { acknowledged: true }; },
    queueBeforeAck: () => {
      assert.equal(mode, 'queued');
      assert.ok(active && !active.destroyed);
      active.end('TAIL');
      return { queued: true }; // Not a network-delivery acknowledgement.
    },
    release: () => {
      assert.ok(active && !active.destroyed);
      if (mode === 'unsafe') active.end('TAIL');
      else if (!available || epoch !== 1) active.close(NGHTTP2_CANCEL);
      else active.end('TAIL');
    },
    done: async () => {
      if (!stream.closed) await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('stream close timeout')), 5000);
        stream.once('close', () => { clearTimeout(timer); resolve(); });
      });
      return { status, body: chunks.join(''), ended, cancelled, failure: failure?.code ?? null };
    },
    close: async () => {
      if (!stream.closed) stream.close(NGHTTP2_CANCEL);
      session.close();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

test('unsafe publisher emits a new HTTP/2 DATA tail after revocation ACK', { timeout: 15000 }, async () => {
  const f = await fixture('unsafe');
  try {
    assert.equal(f.revoke().acknowledged, true);
    f.release();
    const result = await f.done();
    assert.equal(result.status, 200);
    assert.equal(result.body, 'HEADTAIL');
    assert.equal(result.ended, true);
  } finally { await f.close(); }
});

test('per-write generation check cancels post-ACK tail but cannot retract HEAD', { timeout: 15000 }, async () => {
  const f = await fixture('guarded');
  try {
    assert.equal(f.revoke().epoch, 2);
    f.release();
    const result = await f.done();
    assert.equal(result.status, 200); // Headers were already committed.
    assert.equal(result.body, 'HEAD');
    assert.equal(result.body.includes('TAIL'), false);
  } finally { await f.close(); }
});

test('pre-ACK queued DATA is consumed after ACK when HTTP/2 client resumes', { timeout: 15000 }, async () => {
  const f = await fixture('queued');
  try {
    f.pause();
    assert.equal(f.queueBeforeAck().queued, true);
    assert.equal(f.revoke().acknowledged, true);
    f.resume();
    const result = await f.done();
    assert.equal(result.body, 'HEADTAIL');
    assert.equal(result.ended, true);
    // Only application receipt ordering is proven. Not physical wire timing.
  } finally { await f.close(); }
});

test('unavailable authority prevents a new tail and terminates stream', { timeout: 15000 }, async () => {
  const f = await fixture('guarded');
  try {
    assert.equal(f.outage().acknowledged, true);
    f.release();
    const result = await f.done();
    assert.equal(result.body, 'HEAD');
    assert.equal(result.body.includes('TAIL'), false);
  } finally { await f.close(); }
});
