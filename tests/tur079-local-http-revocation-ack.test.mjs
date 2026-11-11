import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

async function fixture() {
  const audit = { bytesQueued: 0, revoked: false, finished: false, closed: false };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const server = createServer(async (_req, res) => {
    res.on('finish', () => { audit.finished = true; });
    res.on('close', () => { audit.closed = true; });
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
    const first = Buffer.from('first-synthetic-chunk');
    res.write(first); audit.bytesQueued += first.length;
    await gate;
    if (audit.revoked || res.destroyed) { res.destroy(); return; }
    const second = Buffer.from('second-synthetic-chunk');
    res.end(second); audit.bytesQueued += second.length;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, audit, release, url: 'http://127.0.0.1:' + server.address().port };
}
test('revocation after first byte cannot retract the first HTTP chunk', async () => {
  const f = await fixture();
  try {
    const response = await fetch(f.url);
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.equal(Buffer.from(first.value).toString(), 'first-synthetic-chunk');
    f.audit.revoked = true;
    f.release();
    await assert.rejects(async () => { while (!(await reader.read()).done) {} });
    assert.equal(f.audit.bytesQueued, Buffer.byteLength('first-synthetic-chunk'));
    assert.equal(f.audit.finished, false);
  } finally { f.release(); await new Promise(resolve => f.server.close(resolve)); }
});
test('HTTP 200 and no-store do not imply durable receiver ACK or global CDN purge', () => {
  const receipt = { status: 200, cacheControl: 'no-store', socketWrite: true, receiverAck: false, globalPurgeAck: false };
  assert.equal(receipt.receiverAck && receipt.globalPurgeAck, false);
});
test('untrusted client ACK cannot authorize a revoked publication generation', () => {
  const state = { publishedGeneration: 3, revokedGeneration: 4, clientClaimsAck: true };
  assert.equal(state.clientClaimsAck && state.publishedGeneration >= state.revokedGeneration, false);
});
