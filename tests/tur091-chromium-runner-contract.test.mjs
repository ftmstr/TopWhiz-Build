import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// TUR091: read-only structural acceptance of previously enforced real Chromium jobs.
// No browser test is replaced by this guard; all 11 must still execute Playwright.
const workflows = [
  "tur010-acceptance.yml",
  "tur011-acceptance.yml",
  "tur012-acceptance.yml",
  "tur013-acceptance.yml",
  "tur014-acceptance.yml",
  "tur015-acceptance.yml",
  "tur017-acceptance.yml",
  "tur018-acceptance.yml",
  "tur019-acceptance.yml",
  "tur020-acceptance.yml",
  "tur021-acceptance.yml"
];
for (const name of workflows) {
  test(name + ': only mandatory Chromium job pinned to verified Ubuntu 24.04 image', () => {
    const source = readFileSync(new URL('../.github/workflows/' + name, import.meta.url), 'utf8');
    const boundaries = [...source.matchAll(/^  ([a-z0-9-]+):\n    runs-on: (ubuntu-latest|ubuntu-24\.04)$/gm)];
    assert.ok(boundaries.length >= 3, 'expected independent Postgres/workerd/supplier jobs');
    const jobs = boundaries.map((m, i) => ({
      name: m[1], runner: m[2],
      body: source.slice(m.index, boundaries[i + 1]?.index ?? source.length),
    }));
    const browser = jobs.filter(j => j.body.includes('playwright install --with-deps chromium'));
    assert.equal(browser.length, 1, 'one actual Chromium installer required');
    assert.equal(browser[0].runner, 'ubuntu-24.04', 'runner image must not drift to ubuntu-latest');
    assert.match(browser[0].body, /pnpm install --frozen-lockfile/);
    assert.match(browser[0].body, /test:browser/);
    assert.match(browser[0].body, /next start/);
    assert.match(browser[0].body, /POSTGRES|ssr-seed\.ts/, 'real synthetic DB fixture must remain');
    assert.equal(jobs.filter(j => j !== browser[0] && j.runner !== 'ubuntu-latest').length, 0,
      'do not change independent Postgres/workerd/license runner jobs');
    assert.doesNotMatch(browser[0].body, /continue-on-error:\s*true|playwright install.*\|\| true|test:browser.*\|\| true/,
      'no silent bypass of mandatory browser acceptance');
  });
}
test('TUR091 covers precisely eleven historical failing Chromium acceptance jobs', () => {
  assert.equal(workflows.length, 11);
  assert.equal(new Set(workflows).size, 11);
});
