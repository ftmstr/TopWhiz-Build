import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const preload = fileURLToPath(new URL('../../../scripts/tur041-next-pg16-preload.mjs', import.meta.url));
const base = {
  CI: 'true', TOPWHIZ_TUR041_REAL_NEXT_TEST: '1',
  TOPWHIZ_CMS_API_BASE: 'https://cms.ci.invalid/',
  TOPWHIZ_CMS_API_HOST: 'cms.ci.invalid',
  TEST_DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/fixture',
  TOPWHIZ_TUR041_SCHEMA: 'tw041_0123456789',
  TOPWHIZ_TUR041_READER: 'tw041_0123456789_reader',
  TOPWHIZ_TUR041_PASSWORD: 'a'.repeat(36)
};
test('TUR043 rejects unsafe PG URL variants before app entry', () => {
  const urls = [
    'http://127.0.0.1:5432/fixture',
    'postgres://127.0.0.1:5432/fixture',
    'postgresql://127.0.0.1:5433/fixture',
    'postgresql://127.0.0.1:5432/fixture?options=-c%20search_path%3Dpublic',
    'postgresql://127.0.0.1:5432/fixture#fragment',
    'not-a-url',
    'postgresql://db.example.invalid:5432/fixture'
  ];
  for (const url of urls) {
    const result = spawnSync(process.execPath, ['--import', preload, '-e', 'console.log("UNSAFE_APP_STARTED")'], {
      env: { ...process.env, ...base, TEST_DATABASE_URL: url }, encoding: 'utf8', timeout: 8000
    });
    assert.equal(result.error, undefined, url);
    assert.notEqual(result.status, 0, url);
    assert.match(result.stderr, /TUR041 test-only Next preload refused unsafe configuration/, url);
    assert.doesNotMatch(result.stdout, /UNSAFE_APP_STARTED/, url);
  }
  console.log(JSON.stringify({suite:'TUR043_PG_URL_FAIL_CLOSED',negativeCases:urls.length,
    inheritedTUR018UnsafeBytes:99276,issue22:'OPEN',lastNetworkByte:'NOT_PROVEN',
    liveCloudflare:'NOT_RUN',release:'NO_GO'}));
});
