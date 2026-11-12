import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, connect } from 'node:http2';
import { EventEmitter, once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Local synthetic credentials and media only. No real R2, IAM, or CDN access.
const ASSET = 'tur109-synthetic-media';
const KEY = 'tur109-loopback-test-only';
const sign = (epoch) => createHmac('sha256', KEY).update(`${ASSET}:${epoch}`).digest('hex');
const valid = (epoch, token) => Number.isSafeInteger(epoch) && epoch > 0 &&
  typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) &&
  timingSafeEqual(Buffer.from(sign(epoch), 'hex'), Buffer.from(token, 'hex'));

async function guardianWorker() {
  let epoch = 1;
  let offline = false;
  let held;
  process.on('message', (message) => {
    if (message.kind === 'reset') {
      epoch = message.epoch; offline = false; held = undefined;
      process.send?.({ kind: 'ack', operation: 'reset', epoch });
    } else if (message.kind === 'revoke') {
      epoch = message.epoch;
      process.send?.({ kind: 'ack', operation: 'revoke', epoch });
    } else if (message.kind === 'offline') {
      offline = true;
      process.send?.({ kind: 'ack', operation: 'offline', epoch });
    } else if (message.kind === 'check') {
      if (offline) return; // Simulate authority loss; publisher must time out closed.
      const result = { kind: 'result', id: message.id, asset: message.asset,
        requestedEpoch: message.epoch, observedEpoch: epoch,
        allowed: message.asset === ASSET && message.epoch === epoch };
      if (message.hold) {
        held = result; // Positive result computed BEFORE revocation, delivered AFTER ACK.
        process.send?.({ kind: 'held', id: message.id });
      } else process.send?.(result);
    } else if (message.kind === 'release') {
      if (held) { process.send?.(held); held = undefined; }
      process.send?.({ kind: 'ack', operation: 'release', epoch });
    }
  });
  process.send?.({ kind: 'ready' });
}

async function publisherWorker() {
  let nextId = 0;
  const checks = new Map();
  process.on('message', (message) => {
    if (message.kind !== 'result') return;
    const pending = checks.get(message.id);
    if (!pending) return; // Unknown or replayed response ID is never authorization.
    checks.delete(message.id);
    clearTimeout(pending.timeout);
    pending.resolve(message.asset === ASSET && message.requestedEpoch === pending.epoch &&
      message.observedEpoch === pending.epoch && message.allowed === true);
  });
  function check(epoch, hold) {
    return new Promise((resolve) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { checks.delete(id); resolve(false); }, 1200);
      checks.set(id, { resolve, epoch, timeout });
      process.send?.({ kind: 'check', id, epoch, asset: ASSET, hold });
    });
  }
  const server = createServer();
  server.on('stream', async (stream, headers) => {
    try {
      const url = new URL(headers[':path'], 'http://localhost');
      const epoch = Number(headers['x-media-epoch']);
      if (url.pathname !== '/media' || !valid(epoch, headers['x-media-signature'])) {
        stream.respond({ ':status': 403 }); stream.end(); return;
      }
      const first = await check(epoch, url.searchParams.get('hold') === '1');
      if (!first) { stream.respond({ ':status': 403 }); stream.end(); return; }
      if (url.searchParams.get('mode') !== 'unsafe') {
        // A pre-ACK positive result is NOT a post-ACK publication grant.
        if (!await check(epoch, false)) {
          stream.respond({ ':status': 403 }); stream.end(); return;
        }
      }
      stream.respond({ ':status': 200 });
      stream.end(epoch === 1 ? 'OLD!' : `NEW${epoch}`);
    } catch (error) {
      if (!stream.destroyed) { stream.respond({ ':status': 503 }); stream.end(); }
      process.send?.({ kind: 'worker-error', message: String(error) });
    }
  });
  server.listen(0, '127.0.0.1', () => process.send?.({ kind: 'ready', port: server.address().port }));
}

if (process.argv[2] === 'guardian') await guardianWorker();
else if (process.argv[2] === 'publisher') await publisherWorker();
else {
  const events = new EventEmitter();
  const children = [];
  let guardian, publisher, port;
  function waitFor(eventName) {
    return Promise.race([
      once(events, eventName).then(([message]) => message),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout: ${eventName}`)), 6000).unref()),
    ]);
  }
  function start(mode) {
    const ready = waitFor(`${mode}:ready`);
    const child = fork(fileURLToPath(import.meta.url), [mode],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
    children.push(child);
    child.stderr.on('data', (data) => events.emit('stderr', String(data)));
    child.on('message', (message) => {
      if (mode === 'publisher' && message.kind === 'check') guardian.send(message);
      else if (mode === 'guardian' && message.kind === 'result') publisher.send(message);
      else events.emit(`${mode}:${message.kind}${message.operation ? `:${message.operation}` : ''}`, message);
    });
    return { child, ready };
  }
  async function control(kind, epoch) {
    const ack = waitFor(`guardian:ack:${kind}`);
    guardian.send({ kind, epoch });
    return await ack;
  }
  async function request(epoch, mode = 'safe', hold = false) {
    const client = connect(`http://127.0.0.1:${port}`);
    try {
      return await new Promise((resolve, reject) => {
        const stream = client.request({ ':path': `/media?mode=${mode}&hold=${hold ? 1 : 0}`,
          'x-media-epoch': String(epoch), 'x-media-signature': sign(epoch) });
        let status;
        const chunks = [];
        stream.on('response', (headers) => { status = headers[':status']; });
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
        stream.on('error', reject);
      });
    } finally { client.close(); }
  }
  before(async () => {
    const g = start('guardian'); guardian = g.child;
    const p = start('publisher'); publisher = p.child;
    const [, publisherReady] = await Promise.all([g.ready, p.ready]);
    port = publisherReady.port;
  });
  after(async () => {
    for (const child of children) child.kill('SIGTERM');
    await Promise.all(children.map((child) => child.exitCode !== null ? Promise.resolve() : once(child, 'exit')));
  });
  test('negative: pre-revoke positive authority reply delivered after ACK leaks OLD! via HTTP/2', async () => {
    await control('reset', 1);
    const held = waitFor('guardian:held');
    const pending = request(1, 'unsafe', true);
    await held;
    assert.equal((await control('revoke', 2)).epoch, 2);
    await control('release');
    assert.deepEqual(await pending, { status: 200, body: 'OLD!' });
  });
  test('protected: same late positive reply is not a post-ACK grant', async () => {
    await control('reset', 1);
    const held = waitFor('guardian:held');
    const pending = request(1, 'safe', true);
    await held;
    assert.equal((await control('revoke', 2)).epoch, 2);
    await control('release');
    assert.deepEqual(await pending, { status: 403, body: '' });
  });
  test('protected: authority disconnect before recheck denies final bytes', async () => {
    await control('reset', 1);
    const held = waitFor('guardian:held');
    const pending = request(1, 'safe', true);
    await held;
    await control('revoke', 2);
    await control('offline');
    await control('release');
    assert.deepEqual(await pending, { status: 403, body: '' });
  });
  test('protected: current epoch accepts NEW2 while stale epoch fails closed', async () => {
    await control('reset', 2);
    assert.deepEqual(await request(2), { status: 200, body: 'NEW2' });
    assert.deepEqual(await request(1), { status: 403, body: '' });
  });
}
