/** TUR018: CI-only frozen install guard. This does not certify licenses.
 * Previous TUR005 lockfile-generation workflow is branch-gated historical
 * tooling and is NOT a TUR018 install path or general license approval.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const manifest=JSON.parse(read("package.json"));
const lock=read("pnpm-lock.yaml");
const legacy=read(".github/workflows/tur002-web-design.yml");
const newCI=read(".github/workflows/tur018-acceptance.yml");
assert.equal(manifest.packageManager,"pnpm@10.18.3");
assert.match(lock,/lockfileVersion:\s*'9\.0'/);
assert.match(legacy,/pnpm install --frozen-lockfile/);
assert.doesNotMatch(legacy,/--no-frozen-lockfile/);
assert.doesNotMatch(newCI,/--no-frozen-lockfile/);
assert.equal((newCI.match(/pnpm install --frozen-lockfile/g)??[]).length,4);
for(const flag of ["node scripts/tur011-license-gate.mjs",
 "pnpm audit --prod --audit-level high",
 "node scripts/tur012-sharp-provenance.mjs"]){
 assert.ok(newCI.includes(flag),"legal/security gate missing: "+flag);
}
console.log(JSON.stringify({suite:"TUR018_FROZEN_LEGACY_WORKFLOW",
 packageManager:manifest.packageManager,lockfileVersion:"9.0",
 legacyTur002Frozen:true,tur018JobsFrozen:4,
 LGPL_AGPL_status:"NOT_APPROVED",
 dormantTur005Generator:"BRANCH_SCOPED_HISTORICAL_ONLY"}));
