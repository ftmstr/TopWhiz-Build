/** TUR021: frozen, negative-evidence and production-release HOLD gate.
 * This is a source-inventory consistency check, not legal approval or a
 * distributed end-to-end transport proof.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const pkg=JSON.parse(read("package.json"));
const ci=read(".github/workflows/tur021-acceptance.yml");
const legacy=read(".github/workflows/tur002-web-design.yml");
const migration=read("services/prices-worker/migrations/0018_cms_media_durable_fence_ci.sql");
const test=read("services/prices-worker/tests/tur021-durable-media-fence.integration.test.ts");
assert.equal(pkg.packageManager,"pnpm@10.18.3");
assert.match(read("pnpm-lock.yaml"),/lockfileVersion:\s*'9\.0'/);
assert.match(legacy,/pnpm install --frozen-lockfile/);
assert.doesNotMatch(legacy,/--no-frozen-lockfile/);
assert.equal((ci.match(/pnpm install --frozen-lockfile/g)??[]).length,4);
for(const s of [
 "tests/tur021-durable-media-fence.integration.test.ts",
 "tests/tur019-schema-acl-shadow.integration.test.ts",
 "tests/tur018-canonical-route.integration.test.ts",
 "tests/tur017-outbox-recovery.integration.test.ts",
 "node scripts/tur018-frozen-ci-gate.mjs",
 "pnpm audit --prod --audit-level high",
 "node scripts/tur011-license-gate.mjs",
 "node scripts/tur012-sharp-provenance.mjs"
])assert.ok(ci.includes(s),"missing CI hard-stop dependency: "+s);
for(const s of [
 "REVOKE ALL ON FUNCTION cms_media_fence_commit_revoke",
 "cms_media_fence_runtime_acl_or_owner_drift",
 "cms_media_fence_active_local_permits",
 "UPDATE cms_media_assets SET rights_approved=false"
])assert.ok(migration.includes(s),"SQL safety invariant absent: "+s);
assert.match(test,/ownerOutOfBandRightsBypassDemonstrated:true/);
assert.match(test,/realR2:"NOT_RUN"/);
assert.match(read("tests/tur018-r2-final-check-gap.test.mjs"),
 /bytesReturnedAfterRevoke/);
assert.match(read("tests/tur019-media-publication-fence.test.mjs"),
 /crossIsolateBypassDemonstrated/);
assert.match(read("tests/tur020-shared-generation-coordinator.test.mjs"),
 /bytesAfterLocalStreamAck/);
assert.match(read("scripts/tur021-workerd-stale.mjs"),/requests:160/);
for(const name of ["REPORT","SECURITY_REVIEW","RECOVERY_RUNBOOK","LICENSE_REVIEW"]){
 const doc=read("docs/TUR021_"+name+".md");
 assert.match(doc,/NO-GO|NOT approved|HOLD/);
}
assert.match(read("docs/TUR021_SECURITY_REVIEW.md"),/Issue #22/);
console.log(JSON.stringify({
 suite:"TUR021_PUBLIC_DRAFT_RELEASE_HOLD",frozenTur002:true,frozenJobs:4,
 actualPg16OnlyInCI:true,originalR2UnsafeBytesPreserved:99276,
 crossIsolateBypassPreserved:true,lastHttpByte:"NOT_PROVEN",
 productionDurableObject:"NOT_RUN",realCDN:"NOT_RUN",
 AGPL_LGPL_legalApproved:false,releaseApproved:false
}));
