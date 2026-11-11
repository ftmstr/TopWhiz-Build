import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { mkdtempSync, writeFileSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

// Loopback-only adversarial model. An independently trusted monotonic authority is NOT implemented.
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'topwhiz-tur093-'));
  const current = join(dir, 'mutable-generation');
  const observedFloor = join(dir, 'synthetic-independent-floor');
  writeFileSync(current, '1\n');
  writeFileSync(observedFloor, '1\n');
  const replace = (path, value) => {
    const temp = join(dir, `replacement-${++sequence}`);
    writeFileSync(temp, `${value}\n`);
    renameSync(temp, path);
  };
  let sequence = 0;
  return { current, observedFloor, replace,
    close() { rmSync(dir, { recursive: true, force: true }); } };
}
function readGeneration(path) {
  try {
    const raw = readFileSync(path, 'utf8').trim();
    if (!/^(0|[1-9][0-9]*)$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
  } catch { return null; }
}
async function publisher(f, { fenced }) {
  const held = new Set();
  const authorized = () => {
    const current = readGeneration(f.current);
    if (current === null) return false;
    if (!fenced) return current === 1; // deliberately unsafe: rollback reauthorizes stale snapshot
    const floor = readGeneration(f.observedFloor);
    return floor !== null && current >= floor && current === 1;
  };
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    if (headers[':path'] !== '/media') { stream.respond({ ':status': 404 }); stream.end(); return; }
    if (!authorized()) {
      stream.respond({ ':status': 403, 'cache-control': 'no-store' });
      stream.end(); return;
    }
    stream.respond({ ':status': 200, 'cache-control': 'no-store' });
    held.add(stream);
    stream.once('close', () => held.delete(stream));
    stream.write('ABCD');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { port: server.address().port,
    async tail() {
      const closing = [...held];
      const closeEvents = closing.map(s => s.closed || s.destroyed ? Promise.resolve() : once(s, 'close'));
      for (const stream of closing) {
        if (authorized()) stream.end('EFGH');
        else stream.close(http2.constants.NGHTTP2_CANCEL);
      }
      await Promise.all(closeEvents);
    },
    async close() {
      for (const s of held) s.close(http2.constants.NGHTTP2_CANCEL);
      server.close();
      await once(server, 'close');
    },
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
    stream.on('response', h => { status = h[':status']; });
    stream.on('data', b => { chunks.push(b); resolveFirst(); });
    stream.once('end', resolve);
    stream.once('close', resolve);
    stream.once('error', resolve);
  });
  return { first, done, get status() { return status; },
    get body() { return Buffer.concat(chunks).toString(); },
    close() { client.destroy(); } };
}

test('mutable generation ABA rollback reauthorizes stale HTTP/2 publisher after revocation', { timeout: 12000 }, async () => {
  const f = fixture(); let p; const clients = [];
  try {
    f.replace(f.current, 2);
    const revokedInode = statSync(f.current).ino;
    f.replace(f.current, 1); // adversarial rollback via path replacement, NOT an authorized grant
    assert.notEqual(statSync(f.current).ino, revokedInode);
    p = await publisher(f, { fenced: false });
    const r = request(p.port); clients.push(r);
    await r.first;
    assert.equal(r.status, 200);
    await p.tail(); await r.done;
    assert.equal(r.body, 'ABCDEFGH');
    assert.equal(Buffer.byteLength(r.body), 8);
  } finally {
    clients.forEach(x => x.close());
    if (p) await p.close(); f.close();
  }
});

test('synthetic independent high-water fence rejects rollback, held tail, and missing authority', { timeout: 12000 }, async () => {
  const f = fixture(); let p; const clients = [];
  try {
    p = await publisher(f, { fenced: true });
    const held = request(p.port); clients.push(held);
    await held.first;
    assert.equal(held.body, 'ABCD');
    f.replace(f.current, 2);
    f.replace(f.observedFloor, 2);
    f.replace(f.current, 1); // mutable source rolls back but independent high-water does not
    await p.tail(); await held.done;
    assert.equal(held.body.includes('EFGH'), false);
    const denied = request(p.port); clients.push(denied);
    await denied.done;
    assert.equal(denied.status, 403);
    assert.equal(denied.body, '');
    rmSync(f.observedFloor);
    const missing = request(p.port); clients.push(missing);
    await missing.done;
    assert.equal(missing.status, 403);
    assert.equal(missing.body, '');
  } finally {
    clients.forEach(x => x.close());
    if (p) await p.close(); f.close();
  }
});

test('rollback of both mutable authority and untrusted high-water file defeats file-only fence', { timeout: 12000 }, async () => {
  const f = fixture(); let p; const clients = [];
  try {
    // First observe a legitimate generation-2 revocation in BOTH files.
    f.replace(f.current, 2);
    f.replace(f.observedFloor, 2);
    assert.equal(readGeneration(f.current), 2);
    assert.equal(readGeneration(f.observedFloor), 2);
    // Adversary with write access to both mutable files restores generation 1.
    // This is not an authorized re-grant. It shows why a local file is not an
    // independent monotonic trust anchor, even if named "observedFloor".
    f.replace(f.current, 1);
    f.replace(f.observedFloor, 1);
    p = await publisher(f, { fenced: true });
    const r = request(p.port); clients.push(r);
    await r.first;
    assert.equal(r.status, 200);
    await p.tail(); await r.done;
    assert.equal(r.body, 'ABCDEFGH');
    assert.equal(Buffer.byteLength(r.body), 8);
  } finally {
    clients.forEach(x => x.close());
    if (p) await p.close(); f.close();
  }
});
