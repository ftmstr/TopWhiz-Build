import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, connect } from 'node:http2';
import { fileURLToPath } from 'node:url';

// Fictional local media and IPC. No real R2, CDN, or production IAM.
const MEDIA = 'tur112-synthetic';
if (process.argv[2] === 'publisher') {
  const safe = process.argv[3] === 'safe';
  const boot = safe ? randomUUID() : 'reused-boot';
  let sequence = 0;
  let floor = 1;
  const pending = new Map();
  process.on('message', message => {
    if (message.kind === 'floor') {
      floor = Math.max(floor, message.epoch);
      process.send?.({ kind: 'floor-ack', epoch: floor });
    }
    if (message.kind === 'reply') {
      const item = pending.get(message.id);
      if (!item) return;
      if (safe && (message.nonce !== item.nonce || message.boot !== boot)) return;
      pending.delete(message.id);
      clearTimeout(item.timeout);
      item.resolve(message.allowed === true && message.epoch === item.epoch && (!safe || item.epoch >= floor));
    }
  });
  function authorize(epoch) {
    return new Promise(resolve => {
      const id = ++sequence;
      const nonce = safe ? randomUUID() : `nonce-${id}`;
      const timeout = setTimeout(() => { pending.delete(id); resolve(false); }, 600);
      pending.set(id, { nonce, epoch, resolve, timeout });
      process.send?.({ kind: 'check', id, nonce, boot, epoch, media: MEDIA });
    });
  }
  const server = createServer();
  server.on('stream', async (stream, headers) => {
    try {
      const epoch = Number(headers['x-epoch']);
      if (headers[':path'] !== '/media' || !Number.isSafeInteger(epoch) || epoch < 1 || (safe && epoch < floor)) {
        stream.respond({ ':status': 403 }); stream.end(); return;
      }
      const allowed = await authorize(epoch);
      if (!allowed || (safe && epoch < floor)) {
        stream.respond({ ':status': 403 }); stream.end(); return;
      }
      stream.respond({ ':status': 200 });
      stream.end(epoch === 1 ? 'OLD!' : 'NEW2');
    } catch (e) {
      if (!stream.destroyed) { stream.respond({ ':status': 503 }); stream.end(); }
      process.send?.({ kind: 'error', detail: String(e) });
    }
  });
  server.listen(0, '127.0.0.1', () => process.send?.({ kind: 'ready', port: server.address().port }));
} else {
  const children = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function spawn(mode) {
    const child = fork(fileURLToPath(import.meta.url), ['publisher', mode], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
    children.push(child);
    const queue = [];
    const listeners = [];
    child.on('message', msg => {
      const index = listeners.findIndex(x => x.kind === msg.kind);
      if (index >= 0) { const l = listeners.splice(index, 1)[0]; clearTimeout(l.timer); l.resolve(msg); }
      else queue.push(msg);
    });
    function next(kind) {
      const i = queue.findIndex(x => x.kind === kind);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const l = {kind, resolve, timer: null};
        l.timer = setTimeout(() => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i,1); reject(new Error(`timeout ${kind}`)); }, 3000);
        listeners.push(l);
      });
    }
    const ready = await next('ready');
    return {child, next, port: ready.port};
  }
  function request(port, epoch) {
    const client = connect(`http://127.0.0.1:${port}`);
    const req = client.request({ ':path': '/media', 'x-epoch': String(epoch) });
    let status, body = '';
    const result = new Promise((resolve, reject) => {
      req.on('response', h => { status = h[':status']; });
      req.on('data', b => { body += b.toString(); });
      req.on('end', () => { client.close(); resolve({status, body}); });
      req.on('error', reject);
    });
    req.end();
    return result;
  }
  function reply(check, allowed = true) { return {kind:'reply', id:check.id, nonce:check.nonce, boot:check.boot, epoch:check.epoch, allowed}; }
  async function stop(p) {
    if (!p.child.killed) { p.child.kill(); await sleep(40); }
  }
  test('TUR112 real loopback HTTP/2 publisher restart / old IPC authorization replay (NO-GO)', async t => {
    t.after(async () => { for (const c of children) if (!c.killed) c.kill(); });
    let captured;
    await t.test('old publisher epoch-1 positive result captured before restart', async () => {
      const a = await spawn('unsafe');
      const response = request(a.port, 1);
      captured = await a.next('check');
      a.child.send(reply(captured));
      assert.deepEqual(await response, {status:200, body:'OLD!'});
      await stop(a);
      assert.equal(captured.id, 1);
    });
    await t.test('unsafe restarted publisher accepts old positive result after epoch-2 revoke ACK', async () => {
      const b = await spawn('unsafe');
      b.child.send({kind:'floor',epoch:2});
      assert.equal((await b.next('floor-ack')).epoch,2);
      const response = request(b.port, 1);
      const newCheck = await b.next('check');
      assert.equal(newCheck.id, captured.id);
      assert.equal(newCheck.nonce, captured.nonce);
      b.child.send(reply(captured));
      assert.deepEqual(await response, {status:200, body:'OLD!'});
      await stop(b);
    });
    await t.test('protected restarted publisher rejects pre-restart reply and old epoch', async () => {
      const b = await spawn('safe');
      const response = request(b.port, 1);
      const newCheck = await b.next('check');
      assert.notEqual(newCheck.boot, captured.boot);
      assert.notEqual(newCheck.nonce, captured.nonce);
      b.child.send({kind:'floor',epoch:2});
      assert.equal((await b.next('floor-ack')).epoch,2);
      b.child.send(reply(captured));
      b.child.send(reply(newCheck, true)); // Even a fresh positive reply cannot beat the epoch-2 floor.
      assert.deepEqual(await response, {status:403, body:''});
      await stop(b);
    });
    await t.test('protected current epoch works, authority outage fails closed', async () => {
      const b = await spawn('safe');
      b.child.send({kind:'floor',epoch:2});
      await b.next('floor-ack');
      const good = request(b.port, 2);
      const current = await b.next('check');
      b.child.send(reply(current));
      assert.deepEqual(await good, {status:200,body:'NEW2'});
      const offline = request(b.port, 2);
      await b.next('check'); // No reply: simulated guardian outage.
      assert.deepEqual(await offline, {status:403,body:''});
      await stop(b);
    });
  });
}
