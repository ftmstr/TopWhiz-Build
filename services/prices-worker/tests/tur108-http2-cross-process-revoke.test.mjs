import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, connect } from 'node:http2';
import { EventEmitter, once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Synthetic, local-only key; no production credentials or remote services.
const KEY = 'topwhiz-tur108-synthetic-only';
const asset = 'synthetic-asset-a';
const signature = (epoch) => createHmac('sha256', KEY).update(`${asset}:${epoch}`).digest('hex');
const validSignature = (epoch, supplied) => {
  if (!Number.isSafeInteger(epoch) || epoch < 1 || typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(signature(epoch), 'hex'), Buffer.from(supplied, 'hex'));
};

async function worker(mode) {
  let localEpoch = 1;
  let cached = { epoch: 1, body: 'OLD!' };
  let nextCheck = 0;
  const checks = new Map();
  let releaseFill;
  process.on('message', (message) => {
    if (message.kind === 'revoke' && mode === 'guardian') {
      localEpoch = message.epoch;
      process.send?.({ kind: 'ack', epoch: localEpoch });
    }
    if (message.kind === 'checked') {
      const resolve = checks.get(message.id);
      if (resolve) { checks.delete(message.id); resolve(message.allowed); }
    }
    if (message.kind === 'release-fill' && releaseFill) {
      const resolve = releaseFill;
      releaseFill = undefined;
      resolve();
    }
  });
  if (mode === 'guardian') { process.send?.({ kind: 'ready' }); return; }
  const check = (epoch) => new Promise((resolve) => {
    const id = ++nextCheck;
    checks.set(id, resolve);
    process.send?.({ kind: 'check', id, epoch, asset });
  });
  const server = createServer();
  server.on('stream', async (stream, headers) => {
    try {
      const url = new URL(headers[':path'], 'http://localhost');
      const epoch = Number(headers['x-media-epoch']);
      const supplied = headers['x-media-signature'];
      if (url.pathname !== '/media' || !validSignature(epoch, supplied)) {
        stream.respond({ ':status': 403 }); stream.end(); return;
      }
      if (mode === 'unsafe') {
        // Deliberately vulnerable: another process's ACK never reaches this cache.
        if (epoch !== localEpoch) { stream.respond({ ':status': 403 }); stream.end(); return; }
        stream.respond({ ':status': 200 }); stream.end(cached.body); return;
      }
      if (!await check(epoch)) { stream.respond({ ':status': 403 }); stream.end(); return; }
      if (url.searchParams.get('delay') === '1') {
        process.send?.({ kind: 'fill-start' });
        await new Promise((resolve) => { releaseFill = resolve; });
      }
      // Revalidate AFTER any asynchronous origin fill and BEFORE cache commit/send.
      if (!await check(epoch)) { stream.respond({ ':status': 403 }); stream.end(); return; }
      if (cached.epoch !== epoch) cached = { epoch, body: epoch === 1 ? 'OLD!' : `NEW${epoch}` };
      stream.respond({ ':status': 200 }); stream.end(cached.body);
    } catch (error) {
      if (!stream.destroyed) { stream.respond({ ':status': 503 }); stream.end(); }
      process.send?.({ kind: 'worker-error', message: String(error) });
    }
  });
  server.listen(0, '127.0.0.1', () => {
    process.send?.({ kind: 'ready', port: server.address().port });
  });
}

if (process.argv[2] === 'worker') {
  await worker(process.argv[3]);
} else {
  const events = new EventEmitter();
  const processes = [];
  const ports = new Map();
  const readyPromises = new Map();
  let authorityEpoch = 1;
  let authorityOffline = false;
  function start(mode) {
    readyPromises.set(mode, waitFor(`${mode}:ready`));
    const child = fork(fileURLToPath(import.meta.url), ['worker', mode], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
    processes.push(child);
    child.stderr.on('data', (chunk) => events.emit('error-output', String(chunk)));
    child.on('message', (message) => {
      if (message.kind === 'check') {
        child.send({ kind: 'checked', id: message.id, allowed: !authorityOffline && message.asset === asset && message.epoch === authorityEpoch });
      } else {
        events.emit(`${mode}:${message.kind}`, message);
      }
    });
    return child;
  }
  function waitFor(eventName) {
    return Promise.race([
      once(events, eventName).then(([message]) => message),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout: ${eventName}`)), 5000).unref()),
    ]);
  }
  async function request(port, epoch, path = '/media') {
    const client = connect(`http://127.0.0.1:${port}`);
    try {
      return await new Promise((resolve, reject) => {
        const stream = client.request({ ':path': path, 'x-media-epoch': String(epoch), 'x-media-signature': signature(epoch) });
        let status;
        const chunks = [];
        stream.on('response', (headers) => { status = headers[':status']; });
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
        stream.on('error', reject);
      });
    } finally { client.close(); }
  }
  let guardian;
  let safe;
  before(async () => {
    guardian = start('guardian');
    start('unsafe');
    safe = start('safe');
    const ready = await Promise.all(['guardian', 'unsafe', 'safe'].map((mode) => readyPromises.get(mode)));
    ['guardian', 'unsafe', 'safe'].forEach((mode, index) => { if (ready[index].port) ports.set(mode, ready[index].port); });
  });
  after(async () => {
    for (const child of processes) child.kill('SIGTERM');
    await Promise.all(processes.map((child) => child.exitCode !== null ? Promise.resolve() : once(child, 'exit')));
  });
  async function revoke(epoch) {
    authorityEpoch = epoch;
    const ack = waitFor('guardian:ack');
    guardian.send({ kind: 'revoke', epoch });
    assert.equal((await ack).epoch, epoch);
  }
  test('negative: independent HTTP/2 cache leaks OLD! after another process acknowledges revoke', async () => {
    await revoke(2);
    assert.deepEqual(await request(ports.get('unsafe'), 1), { status: 200, body: 'OLD!' });
  });
  test('safe: independent process checks shared epoch and rejects stale signed access', async () => {
    assert.deepEqual(await request(ports.get('safe'), 1), { status: 403, body: '' });
  });
  test('safe: new epoch gets fresh content rather than stale cached bytes', async () => {
    assert.deepEqual(await request(ports.get('safe'), 2), { status: 200, body: 'NEW2' });
  });
  test('safe: revoke ACK during delayed origin fill blocks cache commit and final bytes', async () => {
    const started = waitFor('safe:fill-start');
    const pending = request(ports.get('safe'), 2, '/media?delay=1');
    await started;
    await revoke(3);
    safe.send({ kind: 'release-fill' });
    assert.deepEqual(await pending, { status: 403, body: '' });
  });
  test('safe: authority outage fails closed even with fresh valid HMAC', async () => {
    authorityOffline = true;
    assert.deepEqual(await request(ports.get('safe'), 3), { status: 403, body: '' });
  });
}
