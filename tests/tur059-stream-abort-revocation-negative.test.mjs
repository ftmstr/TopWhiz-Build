import test from 'node:test';
import assert from 'node:assert/strict';

function gate() {
  let resume;
  const wait = new Promise(resolve => { resume = resolve; });
  return { wait, resume };
}
function streamScenario({ recheck, abort }) {
  const paused = gate();
  const bytes = [];
  let generation = 1;
  let revoked = false;
  const controller = new AbortController();
  const task = (async () => {
    const authorizedGeneration = generation;
    if (!revoked) bytes.push(Buffer.from('first-fictional-chunk'));
    await paused.wait;
    if (abort) controller.abort();
    if (controller.signal.aborted) return;
    if (recheck && (revoked || generation !== authorizedGeneration)) return;
    bytes.push(Buffer.from('second-fictional-chunk'));
  })();
  return {
    revoke() { revoked = true; generation++; },
    resume: paused.resume,
    task,
    bytes
  };
}
test('negative: last authorization check permits post-revocation queued chunk', async () => {
  const s = streamScenario({ recheck: false, abort: false });
  s.revoke(); s.resume(); await s.task;
  assert.equal(s.bytes.length, 2);
});
test('contrast: generation recheck blocks subsequent unqueued chunk', async () => {
  const s = streamScenario({ recheck: true, abort: false });
  s.revoke(); s.resume(); await s.task;
  assert.equal(s.bytes.length, 1);
});
test('contrast: local AbortSignal prevents subsequent enqueue, not prior bytes', async () => {
  const s = streamScenario({ recheck: false, abort: true });
  s.revoke(); s.resume(); await s.task;
  assert.equal(s.bytes.length, 1);
  assert.equal(s.bytes[0].toString(), 'first-fictional-chunk');
});
test('negative: enqueue count is not remote last-byte receipt', () => {
  const locallyEnqueued = Buffer.from('fictional');
  const remoteAcknowledged = null;
  assert.equal(locallyEnqueued.byteLength, 9);
  assert.equal(remoteAcknowledged, null);
});
