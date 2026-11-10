import test from 'node:test';
import assert from 'node:assert/strict';

// TUR055: synthetic adversarial model, not a Cloudflare/R2 delivery guarantee.
// A one-time rights check cannot authorize subsequent asynchronous chunks.
function createPausedStream({ guardEachChunk }) {
  let generation = 1;
  const authorizedGeneration = generation;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const output = [];
  async function transmit() {
    // This models a previously authorized response, already in flight.
    for (const [index, chunk] of [Buffer.from('first'), Buffer.from('second')].entries()) {
      if (index === 1) await gate;
      if (guardEachChunk && generation !== authorizedGeneration) break;
      output.push(chunk);
    }
    return Buffer.concat(output);
  }
  return { transmit, resume: () => release(), revoke: () => { generation += 1; }, output };
}

test('negative evidence: final lookup permits later chunk after revocation', async () => {
  const stream = createPausedStream({ guardEachChunk: false });
  const pending = stream.transmit();
  assert.equal(Buffer.concat(stream.output).toString(), 'first');
  stream.revoke();
  stream.resume();
  assert.equal((await pending).toString(), 'firstsecond');
});

test('local per-chunk generation guard suppresses not-yet-enqueued second chunk', async () => {
  const stream = createPausedStream({ guardEachChunk: true });
  const pending = stream.transmit();
  stream.revoke();
  stream.resume();
  assert.equal((await pending).toString(), 'first');
});

test('even a per-chunk guard cannot retract bytes already queued before revocation', async () => {
  const stream = createPausedStream({ guardEachChunk: true });
  const pending = stream.transmit();
  stream.resume();
  assert.equal((await pending).toString(), 'firstsecond');
  stream.revoke();
  assert.equal(Buffer.concat(stream.output).length, 11);
});

test('zero post-revocation network bytes cannot be inferred from local output', () => {
  const localEnqueued = Buffer.from('already-enqueued');
  const receiverAcknowledged = false;
  assert.ok(localEnqueued.length > 0);
  assert.equal(receiverAcknowledged, false);
  // Transport delivery and CDN copies are outside this local process.
});
