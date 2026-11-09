import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const preload = fileURLToPath(new URL('../../../scripts/tur041-next-pg16-preload.mjs', import.meta.url));
const base = {
  CI: 'true',
  TOPWHIZ_TUR041_REAL_NEXT_TEST: '1',
  TOPWHIZ_CMS_API_BASE: 'https://cms.ci.invalid/',
  TOPWHIZ_CMS_API_HOST: 'cms.ci.invalid',
  TEST_DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/fixture',
  TOPWHIZ_TUR041_SCHEMA: 'tw041_0123456789',
  TOPWHIZ_TUR041_READER: 'tw041_0123456789_reader',
  TOPWHIZ_TUR041_PASSWORD: 'a'.repeat(36)
};
function run(overrides) {
  return spawnSync(process.execPath, ['--import', preload, '-e', 'process.stdout.write("UNEXPECTED_APP_STARTED")'], {
    env: { ...process.env, ...base, ...overrides },
    encoding: 'utf8', timeout: 8000
  });
}
test('TUR042: CI-only Next preload rejects unsafe origin, DB, identity and execution context', () => {
  const cases = [
    ['CI disabled', { CI: 'false' }],
    ['external database', { TEST_DATABASE_URL: 'postgresql://fixture:fixture@db.example.invalid:5432/fixture' }],
    ['non-TLS CMS origin', { TOPWHIZ_CMS_API_BASE: 'http://cms.ci.invalid/' }],
    ['unapproved CMS host', { TOPWHIZ_CMS_API_HOST: 'other.invalid' }],
    ['schema injection', { TOPWHIZ_TUR041_SCHEMA: 'public;DROP TABLE media' }],
    ['reader role mismatch', { TOPWHIZ_TUR041_READER: 'postgres' }],
    ['invalid password shape', { TOPWHIZ_TUR041_PASSWORD: 'password' }]
  ];
  for (const [label, changes] of cases) {
    const result = run(changes);
    assert.equal(result.error, undefined, label + ': process execution failed');
    assert.notEqual(result.status, 0, label + ': unsafe preload was accepted');
    assert.match(result.stderr, /TUR041 test-only Next preload refused unsafe configuration/, label);
    assert.doesNotMatch(result.stdout, /UNEXPECTED_APP_STARTED/, label);
  }
  console.log(JSON.stringify({suite:'TUR042_PRELOAD_FAIL_CLOSED',rejected:cases.length,
    liveCloudflare:'NOT_RUN',realPG16:'NOT_RUN',lastNetworkByte:'NOT_PROVEN',
    inheritedTUR018UnsafeBytes:99276,issue22:'OPEN',release:'NO_GO'}));
});
