import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Loopback-only adversarial model with fictional bytes. No production handlers.
if (process.argv.includes('--fixture')) {
  const sessions = new Set();
  const held = new Set();
  let revoked = false;
  const server = http2.createServer();
  server.on('session', session => {
    sessions.add(session);
    session.once('close', () => sessions.delete(session));
  });
  server.on('stream', (stream, headers) => {
    if (headers[':path'] !== '/media') {
      stream.respond({ ':status': 404 }); stream.end(); return;
    }
    if (revoked) {
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
      if (command === 'revoke') revoked = true;
      if (command === 'goaway') {
        for (const session of sessions) session.goaway(http2.constants.NGHTTP2_NO_ERROR);
      }
      if (command === 'tail') {
        for (const stream of [...held]) stream.end('EFGH');
      }
      if (command === 'cancel') {
        await Promise.all([...held].map(stream => new Promise(resolve => {
          if (stream.closed || stream.destroyed) return resolve();
          stream.once('close', resolve);
          stream.close(http2.constants.NGHTTP2_CANCEL);
        })));
      }
      process.send?.({ id, ok: true, revoked, held: held.size });
    } catch (error) {
      process.send?.({ id, ok: false, error: String(error) });
    }
  });
  server.listen(0, '127.0.0.1', () => {
    process.send?.({ ready: true, port: server.address().port });
  });
} else {
  async function startPublisher() {
    const child = fork(fileURLToPath(import.meta.url), ['--fixture'], {
      execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    const pending = new Map();
    let seq = 0;
    let readyResolve, readyReject;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve; readyReject = reject;
    });
    child.on('message', msg => {
      if (msg.ready) { readyResolve(msg.port); return; }
      const job = pending.get(msg.id);
      if (!job) return;
      pending.delete(msg.id);
      if (msg.ok) job.resolve(msg);
      else job.reject(new Error(msg.error));
    });
    child.once('exit', (code, signal) => {
      readyReject(new Error(`publisher exited ${code}/${signal}: ${stderr}`));
      for (const job of pending.values()) job.reject(new Error(`publisher exited: ${stderr}`));
      pending.clear();
    });
    const port = await ready;
    return {
      port,
      pid: child.pid,
      command(command) {
        return new Promise((resolve, reject) => {
          const id = ++seq;
          pending.set(id, { resolve, reject });
          child.send({ id, command }, error => {
            if (error) { pending.delete(id); reject(error); }
          });
        });
      },
      async stop() {
        if (child.exitCode !== null) return;
        child.kill('SIGTERM');
        await once(child, 'exit');
      },
    };
  }

  function request(port, pause = false) {
    const client = http2.connect(`http://127.0.0.1:${port}`);
    client.on('error', () => {});
    const stream = client.request({ ':path': '/media' });
    const chunks = [];
    let status;
    let firstResolve;
    const first = new Promise(resolve => { firstResolve = resolve; });
    const done = new Promise((resolve, reject) => {
      stream.on('response', headers => { status = headers[':status']; });
      stream.on('data', chunk => {
        chunks.push(chunk);
        if (chunks.length === 1) firstResolve();
      });
      stream.once('end', resolve);
      stream.once('error', reject);
    });
    if (pause) stream.pause();
    return { client, stream, first, done,
      get status() { return status; },
      get body() { return Buffer.concat(chunks).toString(); },
      close() { client.destroy(); },
    };
  }

  test('two physical HTTP/2 publisher processes: one GOAWAY ACK does not fence stale sibling stream', { timeout: 15000 }, async () => {
    const a = await startPublisher();
    const b = await startPublisher();
    const clients = [];
    try {
      assert.notEqual(a.pid, b.pid);
      const first = request(a.port);
      const sibling = request(b.port);
      clients.push(first, sibling);
      await Promise.all([first.first, sibling.first]);
      assert.equal(first.status, 200);
      assert.equal(sibling.status, 200);
      await a.command('revoke');
      const observedGoaway = once(first.client, 'goaway');
      await a.command('goaway');
      await observedGoaway;
      // Publisher B has not received the revocation and retains its accepted stream.
      const stale = await b.command('tail');
      assert.equal(stale.revoked, false);
      await sibling.done;
      assert.equal(sibling.body, 'ABCDEFGH');
      assert.equal(sibling.body.slice(4).length, 4);
      // A now cancels its accepted stream; no claim about remote final-byte delivery.
      await a.command('cancel');
      await first.done;
      assert.equal(first.body.includes('EFGH'), false);
    } finally {
      for (const c of clients) c.close();
      await Promise.all([a.stop(), b.stop()]);
    }
  });

  test('both publishers cancel streams before ACK: no new app tail, but paused receiver retains old bytes', { timeout: 15000 }, async () => {
    const a = await startPublisher();
    const b = await startPublisher();
    const clients = [];
    try {
      assert.notEqual(a.pid, b.pid);
      const first = request(a.port);
      const paused = request(b.port, true);
      clients.push(first, paused);
      await first.first;
      // Paused receiver can have bytes in transport buffers before reading them.
      await Promise.all([a.command('revoke'), b.command('revoke')]);
      const closed = await Promise.all([a.command('cancel'), b.command('cancel')]);
      assert.deepEqual(closed.map(x => x.held), [0, 0]);
      paused.stream.resume();
      await Promise.all([first.done, paused.done]);
      assert.equal(first.body.includes('EFGH'), false);
      assert.equal(paused.body.includes('EFGH'), false);
      // Application read after ACK is not proof that bytes were written after ACK.
      assert.equal(paused.body, 'ABCD');
      const fresh = request(b.port);
      clients.push(fresh);
      await fresh.done;
      assert.equal(fresh.status, 403);
      assert.equal(fresh.body, '');
    } finally {
      for (const c of clients) c.close();
      await Promise.all([a.stop(), b.stop()]);
    }
  });
}
