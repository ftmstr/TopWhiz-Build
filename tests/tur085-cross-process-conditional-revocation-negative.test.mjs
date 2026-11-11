import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { once } from 'node:events';

// Intentionally unsafe *synthetic* publisher; never use for production authorization.
const publisher = String.raw`
const { createServer } = require('node:http');
const etag = '"fictional-content-v1"';
const bytes = Buffer.from('ABCDEFGH');
let generation = 1;
let revoked = false;
const server = createServer((req, res) => {
  if (req.url !== '/media') { res.writeHead(404); res.end(); return; }
  if (revoked) { res.writeHead(403, { 'Cache-Control': 'no-store' }); res.end(); return; }
  const headers = { 'ETag': etag, 'Cache-Control': 'no-store', 'X-Synthetic-Generation': String(generation) };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
  if (req.headers['if-range'] === etag && req.headers.range === 'bytes=4-7') {
    res.writeHead(206, { ...headers, 'Content-Range': 'bytes 4-7/8', 'Content-Length': '4' });
    res.end(bytes.subarray(4)); return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': '8' });
  res.end(bytes);
});
server.listen(0, '127.0.0.1', () => process.send({ type: 'ready', port: server.address().port }));
process.on('message', message => {
  if (message?.type === 'revoke') { revoked = true; generation += 1; process.send({ type: 'revoked', generation }); }
  if (message?.type === 'shutdown') { server.closeAllConnections(); server.close(() => process.exit(0)); }
});
`;

function awaitMessage(child, type, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    function onMessage(message) { if (message?.type === type) finish(null, message); }
    function onExit(code) { finish(new Error(`Publisher exited before ${type}: ${code}`)); }
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

async function startPublisher() {
  const child = spawn(process.execPath, ['-e', publisher], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  try {
    const ready = await awaitMessage(child, 'ready');
    return { child, port: ready.port };
  } catch (error) { child.kill('SIGKILL'); throw error; }
}

async function closePublisher(p) {
  if (!p || p.child.exitCode !== null || p.child.signalCode !== null) return;
  const exited = once(p.child, 'exit');
  p.child.send({ type: 'shutdown' });
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Publisher shutdown timeout')), 2000))])
    .catch(error => { p.child.kill('SIGKILL'); throw error; });
}

async function withTwoPublishers(run) {
  let a, b;
  try { a = await startPublisher(); b = await startPublisher(); await run(a, b); }
  finally { await Promise.allSettled([closePublisher(a), closePublisher(b)]); if (a?.child.exitCode === null) a.child.kill('SIGKILL'); if (b?.child.exitCode === null) b.child.kill('SIGKILL'); }
}

function get(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: '/media', method: 'GET', headers, timeout: 3000 }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function revoke(p) {
  const ack = awaitMessage(p.child, 'revoked');
  p.child.send({ type: 'revoke' });
  return ack;
}

test('two isolated publishers: stale conditional 304 cannot revoke client-held bytes', { timeout: 15000 }, async () => {
  await withTwoPublishers(async (a, b) => {
    assert.notEqual(a.child.pid, b.child.pid);
    const initial = await get(b.port);
    assert.equal(initial.status, 200);
    assert.equal(initial.body.toString(), 'ABCDEFGH');
    const ack = await revoke(a);
    assert.equal(ack.generation, 2);
    const fenced = await get(a.port, { 'If-None-Match': initial.headers.etag });
    assert.equal(fenced.status, 403);
    assert.equal(fenced.body.length, 0);
    const stale = await get(b.port, { 'If-None-Match': initial.headers.etag });
    assert.equal(stale.status, 304);
    assert.equal(stale.body.length, 0);
    assert.equal(stale.headers['x-synthetic-generation'], '1');
    assert.equal(initial.body.length, 8); // previously delivered bytes remain with the client
  });
});

test('two isolated publishers: stale If-Range 206 leaks four NEW fictional bytes after peer revoke', { timeout: 15000 }, async () => {
  await withTwoPublishers(async (a, b) => {
    const initial = await get(b.port);
    assert.equal(initial.status, 200);
    await revoke(a);
    const headers = { 'If-Range': initial.headers.etag, 'Range': 'bytes=4-7' };
    const fenced = await get(a.port, headers);
    assert.equal(fenced.status, 403);
    const stale = await get(b.port, headers);
    assert.equal(stale.status, 206);
    assert.equal(stale.headers['content-range'], 'bytes 4-7/8');
    assert.equal(stale.headers['cache-control'], 'no-store');
    assert.equal(stale.headers['x-synthetic-generation'], '1');
    assert.equal(stale.body.toString(), 'EFGH');
    assert.equal(stale.body.length, 4); // negative evidence, not a mitigation
  });
});
