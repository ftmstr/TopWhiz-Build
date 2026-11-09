/** TUR019 release HOLD gate. This validates documentation and test
 * inventory, not production readiness or legal compliance.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const pkg=JSON.parse(read("package.json"));
const legacy=read(".github/workflows/tur002-web-design.yml");
const current=read(".github/workflows/tur019-acceptance.yml");
const negative=read("tests/tur018-r2-final-check-gap.test.mjs");
const fence=read("services/prices-worker/src/cms/media-publication-fence.mjs");
const suite=read("tests/tur019-media-publication-fence.test.mjs");
const report=read("docs/TUR019_SECURITY_REVIEW.md");
assert.equal(pkg.packageManager,"pnpm@10.18.3");
assert.match(read("pnpm-lock.yaml"),/lockfileVersion:\s*'9\.0'/);
assert.match(legacy,/pnpm install --frozen-lockfile/);
assert.doesNotMatch(legacy,/pnpm install --no-frozen-lockfile/);
assert.equal((current.match(/pnpm install --frozen-lockfile/g)??[]).length,4);
for(const mark of [
 "pnpm audit --prod --audit-level high",
 "node scripts/tur011-license-gate.mjs",
 "node scripts/tur012-sharp-provenance.mjs"
])assert.ok(current.includes(mark),"missing release supplier gate: "+mark);
assert.ok(negative.includes("bytesReturnedAfterRevoke"));
assert.ok(negative.includes("OPEN_RELEASE_BLOCKER"));
assert.ok(fence.includes("NOT a Cloudflare/R2 production middleware"));
assert.ok(suite.includes("crossIsolateBypassDemonstrated"));
assert.match(report,/Issue #22/);
assert.match(report,/NO-GO/);
console.log(JSON.stringify({suite:"TUR019_RELEASE_FENCE_HOLD",
 frozenTur002:true,frozenJobs:4,originalNegativeProofRetained:true,
 distributedLastByteFence:"NOT_IMPLEMENTED",
 releaseApproved:false,legalApproved:false,realR2:"NOT_RUN"}));
