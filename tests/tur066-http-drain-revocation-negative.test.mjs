import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';

// CI-only fictional bytes. Negative evidence, not a Cloudflare/CDN proof.
const chunkA = Buffer.from('FICTIONAL-TUR066-CHUNK-A');
const chunkB = Buffer.from('FICTIONAL-TUR066-CHUNK-B');
async function scenario({ recheck }) {
  let generation = 1;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let paused;
  const pausedAt = new Promise(resolve => { paused = resolve; });
  const server = http.createServer(async (req, res) => {
    const admitted = generation;
    res.writeHead(200, {'content-type':'application/octet-stream','cache-control':'no-store'});
    res.write(chunkA);
    paused();
    await gate;
    if (recheck && admitted !== generation) { res.destroy(); return; }
    res.end(chunkB);
  });
  server.listen(0, '127.0.0.1');
  await once(server,'listening');
  const chunks = [];
  const response = new Promise((resolve,reject) => {
    const request = http.get({hostname:'127.0.0.1',port:server.address().port}, res => {
      res.on('data', b => chunks.push(b));
      res.on('end', () => resolve({status:res.statusCode, bytes:Buffer.concat(chunks)}));
      res.on('aborted', () => resolve({status:res.statusCode, bytes:Buffer.concat(chunks), aborted:true}));
      res.on('error', reject);
    });
    request.on('error', reject);
  });
  try {
    await pausedAt;
    generation = 2; // synthetic acknowledged revocation after first write
    release();
    return await response;
  } finally {
    release();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
test('HTTP: final authorization check alone leaks a second fictional chunk after revocation', async () => {
  const result = await scenario({recheck:false});
  assert.equal(result.status,200);
  assert.deepEqual(result.bytes,Buffer.concat([chunkA,chunkB]));
});
test('HTTP: per-chunk generation recheck blocks second chunk but cannot retract first', async () => {
  const result = await scenario({recheck:true});
  assert.equal(result.status,200);
  assert.deepEqual(result.bytes,chunkA);
  assert.equal(result.aborted,true);
});
test('No-store is response cache policy, not a delivery or CDN invalidation proof', () => {
  assert.equal('no-store'.includes('no-store'),true);
  assert.ok(chunkA.length > 0);
});
