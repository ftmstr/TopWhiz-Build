/** TUR020: hard fail-closed release-policy inventory; NOT legal clearance. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const packageJson=JSON.parse(read("package.json"));
const old=read(".github/workflows/tur002-web-design.yml");
const current=read(".github/workflows/tur020-acceptance.yml");
const originalNegative=read("tests/tur018-r2-final-check-gap.test.mjs");
const localBypass=read("tests/tur019-media-publication-fence.test.mjs");
const shared=read("services/prices-worker/src/cms/media-generation-coordinator.mjs");
const sharedTests=read("tests/tur020-shared-generation-coordinator.test.mjs");
assert.equal(packageJson.packageManager,"pnpm@10.18.3");
assert.match(read("pnpm-lock.yaml"),/lockfileVersion:\s*'9\.0'/);
assert.match(old,/pnpm install --frozen-lockfile/);
assert.doesNotMatch(old,/pnpm install --no-frozen-lockfile/);
assert.equal((current.match(/pnpm install --frozen-lockfile/g)??[]).length,4);
for(const term of ["pnpm audit --prod --audit-level high",
 "node scripts/tur011-license-gate.mjs",
 "node scripts/tur012-sharp-provenance.mjs",
 "node scripts/tur020-release-hold.mjs",
 "tur019-schema-acl-shadow.integration.test.ts",
 "tur018-canonical-route.integration.test.ts",
 "tur017-outbox-recovery.integration.test.ts"]){
 assert.ok(current.includes(term),"required release/DB control missing: "+term);
}
assert.match(originalNegative,/bytesReturnedAfterRevoke/);
assert.match(localBypass,/crossIsolateBypassDemonstrated/);
assert.match(shared,/CI-ONLY shared-state generation/);
assert.match(shared,/NOT evidence/);
assert.match(sharedTests,/bytesAfterLocalStreamAck/);
assert.match(read("scripts/tur020-workerd-stale.mjs"),/requests:128/);
for(const file of [
 "docs/TUR020_REPORT.md",
 "docs/TUR020_SECURITY_REVIEW.md",
 "docs/TUR020_RECOVERY_RUNBOOK.md",
 "docs/TUR020_LICENSE_REVIEW.md"
]){
 assert.match(read(file),/NO-GO|NO GO|NOT approved|NOT_APPROVED|HOLD/i,
  "release hold missing in "+file);
}
console.log(JSON.stringify({suite:"TUR020_RELEASE_NO_GO",
  frozenTur002:true,frozenJobs:4,
  historical12UnsafeR2ReadsPreserved:true,crossIsolateNegativePreserved:true,
  liveSharedDurableObject:"NOT_RUN",lastNetworkByte:"NOT_PROVEN",
  legalApproved:false,releaseApproved:false}));
