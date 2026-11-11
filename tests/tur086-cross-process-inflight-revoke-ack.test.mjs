import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Deliberately unsafe fictional media publisher. Negative evidence only.
const publisherSource = String.raw`
const { createServer } = require('node:http');
let revoked = false;
let generation = 1;
const held = new Set();
const server = createServer((req, res) => {
  if (req.url !== '/media') { res.writeHead(404); res.end(); return; }
  if (revoked) { res.writeHead(403, { 'Cache-Control': 'no-store' }); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Synthetic-Generation': String(generation) });
  res.write('ABCD');
  held.add(res);
  res.once('close', () => held.delete(res));
});
server.listen(0, '127.0.0.1', () => process.send({ type: 'ready', port: server.address().port }));
process.on('message', message => {
  if (message?.type === 'revoke') {
    revoked = true; generation += 1;
    process.send({ type: 'revoked', generation, held: held.size });
  }
  if (message?.type === 'release') {
    const count = held.size;
    for (const res of [...held]) { res.end('EFGH'); held.delete(res); }
    process.send({ type: 'released', count });
  }
  if (message?.type === 'shutdown') {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  }
});
`;

function awaitMessage(child, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    function onMessage(message) { if (message?.type === type) finish(null, message); }
    function onExit(code) { finish(new Error(`Child exited before ${type}: ${code}`)); }
    function finish(error, value) {
      clearTimeout(timeout);
      child.off('message', onMessage);
      child.off('exit', onExit);
      error ? reject(error) : resolve(value);
    }
    child.on('message', onMessage);
    child.once('exit', onExit);
  });
}

async function spawnPublisher() {
  const child = spawn(process.execPath, ['-e', publisherSource], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  try {
    const { port } = await awaitMessage(child, 'ready');
    return { child, port };
  } catch (error) { child.kill('SIGKILL'); throw error; }
}

async function sendAndWait(publisher, type, reply) {
  const answer = awaitMessage(publisher.child, reply);
  publisher.child.send({ type });
  return answer;
}

async function withPublishers(fn) {
  const publishers = [];
  try {
    publishers.push(await spawnPublisher(), await spawnPublisher());
    assert.notEqual(publishers[0].child.pid, publishers[1].child.pid);
    await fn(...publishers);
  } finally {
    await Promise.all(publishers.map(async ({ child }) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.send({ type: 'shutdown' });
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1500))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }));
  }
}

async function openHeldStream(port) {
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${port}/media`, { signal: controller.signal, cache: 'no-store' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(first.done, false);
  assert.equal(Buffer.from(first.value).toString(), 'ABCD');
  return { reader, controller, generation: response.headers.get('x-synthetic-generation') };
}

async function finishStream(stream) {
  const tail = await stream.reader.read();
  assert.equal(tail.done, false);
  assert.equal(Buffer.from(tail.value).toString(), 'EFGH');
  const end = await stream.reader.read();
  assert.equal(end.done, true);
  stream.controller.abort();
  return tail.value.length;
}

test('both publishers acknowledge revocation yet an already-open HTTP response sends four NEW bytes after ACK', { timeout: 15000 }, async () => {
  await withPublishers(async (a, b) => {
    const stream = await openHeldStream(b.port);
    assert.equal(stream.generation, '1');
    const [ackA, ackB] = await Promise.all([sendAndWait(a, 'revoke', 'revoked'), sendAndWait(b, 'revoke', 'revoked')]);
    assert.equal(ackA.generation, 2);
    assert.equal(ackB.generation, 2);
    assert.equal(ackB.held, 1);
    const deniedA = await fetch(`http://127.0.0.1:${a.port}/media`);
    const deniedB = await fetch(`http://127.0.0.1:${b.port}/media`);
    assert.equal(deniedA.status, 403);
    assert.equal(deniedB.status, 403);
    const release = await sendAndWait(b, 'release', 'released');
    assert.equal(release.count, 1);
    assert.equal(await finishStream(stream), 4); // physical loopback bytes after both revocation ACKs
  });
});

test('two simultaneous in-flight HTTP streams deliver eight NEW bytes despite generation-2 ACK on both publishers', { timeout: 15000 }, async () => {
  await withPublishers(async (a, b) => {
    const streams = await Promise.all([openHeldStream(b.port), openHeldStream(b.port)]);
    const [ackA, ackB] = await Promise.all([sendAndWait(a, 'revoke', 'revoked'), sendAndWait(b, 'revoke', 'revoked')]);
    assert.equal(ackA.generation, 2);
    assert.equal(ackB.generation, 2);
    assert.equal(ackB.held, 2);
    const release = await sendAndWait(b, 'release', 'released');
    assert.equal(release.count, 2);
    const tails = await Promise.all(streams.map(finishStream));
    assert.deepEqual(tails, [4, 4]);
    assert.equal(tails.reduce((a, b) => a + b, 0), 8);
  });
});
