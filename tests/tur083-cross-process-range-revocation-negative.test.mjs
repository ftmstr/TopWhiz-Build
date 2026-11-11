import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';

// Controlled negative counterexample, not a production media proxy.
if (process.argv[2] === '--publisher') {
  let generation = 1;
  let revoked = false;
  const pending = new Set();
  const server = createServer((req, res) => {
    if (req.url !== '/media' || req.headers.range !== 'bytes=0-7') {
      res.writeHead(416); res.end(); return;
    }
    res.writeHead(206, { 'Content-Range': 'bytes 0-7/8', 'Content-Length': 8, 'Cache-Control': 'no-store' });
    res.write('ABCD');
    pending.add(res);
  });
  process.on('message', message => {
    if (message?.type === 'revoke') {
      generation = message.generation;
      revoked = true;
      process.send?.({ type: 'revoked', generation });
    }
    if (message?.type === 'release') {
      for (const res of pending) {
        if (revoked) res.destroy();
        else res.end('EFGH'); // Unsafe stale publisher after another process revoked.
      }
      pending.clear();
      process.send?.({ type: 'released', generation, revoked });
    }
    if (message?.type === 'shutdown') {
      for (const res of pending) res.destroy();
      pending.clear();
      server.closeAllConnections();
      server.close(() => process.exit(0));
    }
  });
  server.listen(0, '127.0.0.1', () => process.send?.({ type: 'ready', port: server.address().port }));
} else {
  test('two independent Node publisher processes: local revocation does not fence sibling range tail', { timeout: 10000 }, async () => {
    const children = [];
    const requests = [];
    function waitMessage(child, type) {
      return new Promise((resolve, reject) => {
        const onMessage = m => { if (m?.type === type) { cleanup(); resolve(m); } };
        const onExit = () => { cleanup(); reject(new Error('publisher exited before ' + type)); };
        function cleanup() { child.off('message', onMessage); child.off('exit', onExit); }
        child.on('message', onMessage); child.on('exit', onExit);
      });
    }
    function startPublisher() {
      const child = fork(new URL(import.meta.url), ['--publisher'], { execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      children.push(child);
      return { child, ready: waitMessage(child, 'ready') };
    }
    function readRange(port) {
      let firstResolve;
      const first = new Promise(resolve => { firstResolve = resolve; });
      const done = new Promise((resolve, reject) => {
        const req = get({ hostname: '127.0.0.1', port, path: '/media', headers: { Range: 'bytes=0-7' } }, res => {
          assert.equal(res.statusCode, 206);
          const chunks = [];
          res.on('data', chunk => { chunks.push(chunk); firstResolve(); });
          res.on('end', () => resolve({ body: Buffer.concat(chunks).toString(), complete: true }));
          res.on('aborted', () => resolve({ body: Buffer.concat(chunks).toString(), complete: false }));
          res.on('error', () => resolve({ body: Buffer.concat(chunks).toString(), complete: false }));
        });
        requests.push(req);
        req.on('error', reject);
      });
      return { first, done };
    }
    try {
      const a = startPublisher(), b = startPublisher();
      const [ar, br] = await Promise.all([a.ready, b.ready]);
      const ra = readRange(ar.port), rb = readRange(br.port);
      await Promise.all([ra.first, rb.first]);
      const ack = waitMessage(a.child, 'revoked');
      a.child.send({ type: 'revoke', generation: 2 });
      assert.equal((await ack).generation, 2);
      const releasedA = waitMessage(a.child, 'released'), releasedB = waitMessage(b.child, 'released');
      a.child.send({ type: 'release' });
      b.child.send({ type: 'release' });
      const [sa, sb, oa, ob] = await Promise.all([ra.done, rb.done, releasedA, releasedB]);
      assert.equal(sa.body, 'ABCD');
      assert.equal(sa.complete, false);
      assert.equal(sb.body, 'ABCDEFGH');
      assert.equal(sb.complete, true);
      assert.deepEqual([oa.generation, oa.revoked], [2, true]);
      assert.deepEqual([ob.generation, ob.revoked], [1, false]);
      assert.equal(sb.body.length - 4, 4, 'four stale bytes escaped the sibling process');
    } finally {
      for (const req of requests) req.destroy();
      await Promise.all(children.map(async child => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, 'exit').catch(() => {});
        child.send({ type: 'shutdown' });
        await Promise.race([exited, new Promise(resolve => setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 500))]);
      }));
    }
  });

  test('process-local generation and ACK cannot certify cross-process revocation barrier', () => {
    const a = { generation: 2, revoked: true, receiverAck: null };
    const b = { generation: 1, revoked: false, receiverAck: null };
    assert.notEqual(a.generation, b.generation);
    assert.equal(Boolean(a.receiverAck && b.receiverAck), false);
    assert.equal(b.revoked, false);
  });
}