// TUR044: deterministic NEGATIVE evidence, not a distributed revocation fix.
// No Cloudflare, customer bytes, production database, or network is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';

function admittedStream({ publisher, generation, chunks }) {
  // A previously admitted producer holds an immutable authorization snapshot.
  return { publisher, generation, chunks: [...chunks], index: 0 };
}
function readNext(stream) {
  return stream.chunks[stream.index++] ?? null;
}
function authorizeNew(currentGeneration, revoked, requestedGeneration) {
  return !revoked && requestedGeneration === currentGeneration;
}

test('TUR044: independent admitted producers can outlive generation withdrawal (NO-GO)', () => {
  let generation = 7;
  let revoked = false;
  const streams = [
    admittedStream({ publisher: 'isolate-A', generation, chunks: [11, 13, 17] }),
    admittedStream({ publisher: 'isolate-B', generation, chunks: [19, 23, 29] }),
  ];
  assert.equal(authorizeNew(generation, revoked, 7), true);
  assert.equal(readNext(streams[0]), 11);
  assert.equal(readNext(streams[1]), 19);
  // Simulated durable revoke/commit: does not recall already admitted streams.
  generation = 8;
  revoked = true;
  assert.equal(authorizeNew(generation, revoked, 7), false);
  assert.equal(authorizeNew(generation, revoked, 8), false);
  const afterRevoke = streams.flatMap(s => {
    const output = [];
    for (let byte; (byte = readNext(s)) !== null;) output.push(byte);
    return output;
  });
  assert.deepEqual(afterRevoke, [13, 17, 23, 29]);
  assert.equal(afterRevoke.length, 4, 'NEGATIVE: bytes remain deliverable after revoke');
  assert.equal(streams[0].generation, 7);
  assert.equal(streams[1].generation, 7);
});

test('TUR044: local abort only stops the addressed producer, not a peer isolate', () => {
  const first = admittedStream({ publisher: 'isolate-A', generation: 2, chunks: [1, 2] });
  const second = admittedStream({ publisher: 'isolate-B', generation: 2, chunks: [3, 4] });
  first.chunks.length = 0; // local cancellation, not global revocation fence
  assert.equal(readNext(first), null);
  assert.deepEqual([readNext(second), readNext(second)], [3, 4]);
});
