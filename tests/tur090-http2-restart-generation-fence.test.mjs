import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Loopback-only synthetic counterexamples; the file is NOT a production authorization service.
if (process.argv.includes('--fixture')) {
  const held = new Set();
  const staleGeneration = Number(process.env.TUR090_STALE_GENERATION);
  const guarded = process.env.TUR090_GUARDED === '1';
  const authorityPath = process.env.TUR090_AUTHORITY_PATH;
  const authorized = () => {
    if (!guarded) return true; // deliberately unsafe local snapshot
    try {
      const value = readFileSync(authorityPath, 'utf8').trim();
      return /^\d+$/.test(value) && Number(value) === staleGeneration;
    } catch { return false; } // unavailable authority is fail-closed
  };
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    if (headers[':path'] !== '/media') {
      stream.respond({ ':status': 404 }); stream.end(); return;
    }
    if (!authorized()) {
      stream.respond({ ':status': 403, 'cache-control': 'no-store' });
      stream.end(); return;
    }
    stream.respond({ ':status': 200, 'cache-control': 'no-store' });
    held.add(stream);
    stream.once('close', () => held.delete(stream));
    stream.write('ABCD');
  });
  process.on('message', async ({ id, command }) => {
    try {
      if (command === 'tail') {
        for (const stream of [...held]) {
          if (authorized()) stream.end('EFGH');
          else stream.close(http2.constants.NGHTTP2_CANCEL);
        }
        await Promise.all([...held].map(stream => stream.closed || stream.destroyed
          ? Promise.resolve() : once(stream, 'close')));
      }
      process.send?.({ id, ok: true, held: held.size });
    } catch (error) { process.send?.({ id, ok: false, error: String(error) }); }
  });
  server.listen(0, '127.0.0.1', () => process.send?.({ ready: true, port: server.address().port }));
} else {
  function authority() {
    const dir = mkdtempSync(join(tmpdir(), 'topwhiz-tur090-'));
    const path = join(dir, 'generation.txt');
    writeFileSync(path, '1\n');
    return { path, revoke() { writeFileSync(path, '2\n'); },
      unavailable() { rmSync(path); }, close() { rmSync(dir, { recursive: true, force: true }); } };
  }
  async function publisher(path, guarded) {
    const child = fork(fileURLToPath(import.meta.url), ['--fixture'], {
      execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: { ...process.env, TUR090_AUTHORITY_PATH: path,
        TUR090_STALE_GENERATION: '1', TUR090_GUARDED: guarded ? '1' : '0' },
    });
    let stderr = '';
    child.stderr.on('data', b => { stderr += b.toString(); });
    const pending = new Map();
    let seq = 0;
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    child.on('message', msg => {
      if (msg.ready) { resolveReady(msg.port); return; }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg); else p.reject(new Error(msg.error));
    });
    child.once('exit', (code, signal) => {
      rejectReady(new Error(`publisher exited ${code}/${signal}: ${stderr}`));
      for (const p of pending.values()) p.reject(new Error(`publisher exited: ${stderr}`));
      pending.clear();
    });
    const port = await ready;
    return { port, pid: child.pid,
      command(command) { return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        child.send({ id, command }, error => { if (error) { pending.delete(id); reject(error); } });
      }); },
      async stop() { if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill('SIGTERM'); await once(child, 'exit'); },
    };
  }
  function request(port) {
    const client = http2.connect(`http://127.0.0.1:${port}`);
    client.on('error', () => {});
    const stream = client.request({ ':path': '/media' });
    const chunks = [];
    let status;
    let resolveFirst;
    const first = new Promise(resolve => { resolveFirst = resolve; });
    const done = new Promise(resolve => {
      stream.on('response', headers => { status = headers[':status']; });
      stream.on('data', chunk => { chunks.push(chunk); resolveFirst(); });
      stream.once('end', resolve);
      stream.once('error', resolve); // RST_STREAM is an expected local cancel
      stream.once('close', resolve);
    });
    return { first, done, get status() { return status; },
      get body() { return Buffer.concat(chunks).toString(); },
      close() { client.destroy(); } };
  }
  test('restart rehydrates stale publisher snapshot: eight fictional post-revoke HTTP/2 bytes', { timeout: 15000 }, async () => {
    const a = authority();
    const clients = [];
    let p, restarted;
    try {
      p = await publisher(a.path, false);
      await p.stop();
      a.revoke();
      assert.equal(readFileSync(a.path, 'utf8').trim(), '2');
      restarted = await publisher(a.path, false);
      assert.notEqual(p.pid, restarted.pid);
      const r = request(restarted.port); clients.push(r);
      await r.first;
      assert.equal(r.status, 200);
      await restarted.command('tail');
      await r.done;
      assert.equal(r.body, 'ABCDEFGH');
      assert.equal(Buffer.byteLength(r.body), 8);
    } finally {
      clients.forEach(x => x.close());
      await Promise.all([p?.stop(), restarted?.stop()]); a.close();
    }
  });
  test('guarded publisher rechecks generation at tail and restart; missing authority denies', { timeout: 15000 }, async () => {
    const a = authority();
    const clients = [];
    let p, restarted;
    try {
      p = await publisher(a.path, true);
      const held = request(p.port); clients.push(held);
      await held.first;
      assert.equal(held.body, 'ABCD');
      a.revoke();
      await p.command('tail');
      await held.done;
      assert.equal(held.body.includes('EFGH'), false);
      await p.stop();
      restarted = await publisher(a.path, true);
      const denied = request(restarted.port); clients.push(denied);
      await denied.done;
      assert.equal(denied.status, 403);
      assert.equal(denied.body, '');
      a.unavailable();
      const missing = request(restarted.port); clients.push(missing);
      await missing.done;
      assert.equal(missing.status, 403);
      assert.equal(missing.body, '');
    } finally {
      clients.forEach(x => x.close());
      await Promise.all([p?.stop(), restarted?.stop()]); a.close();
    }
  });
}