import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const p=JSON.parse(root("apps/web/package.json"));
const worker=JSON.parse(root("services/prices-worker/package.json"));
const lock=root("pnpm-lock.yaml");
const registry=JSON.parse(root("apps/web/data/published-content.json"));
for(const dependency of ["react","react-dom","react-server-dom-webpack"]){
 assert.equal(p.dependencies[dependency],"19.3.1",dependency+" not pinned");
 assert.ok(lock.includes("      "+dependency+":\n        specifier: 19.3.1"),
   dependency+" missing frozen lockfile spec");
}
for(const [name,version] of [
 ["@vitejs/plugin-rsc","0.5.39"],
 ["@playwright/test","1.65.0"],
 ["@axe-core/playwright","4.14.0"]
]){
 assert.equal(p.devDependencies[name],version);
 const label=name.startsWith("@")?"'"+name+"'":name;
 assert.ok(lock.includes("      "+label+":\n        specifier: "+version),
   name+" missing frozen lockfile spec");
}
assert.ok(["4.135.0","4.158.0"].includes(worker.devDependencies.wrangler),"reviewed Wrangler pin required");
assert.deepEqual(registry,{news:[],phones:[]});
const wrangler=root("services/prices-worker/wrangler.toml");
const cmsWrangler=root("services/prices-worker/wrangler.cms.toml");
assert.doesNotMatch(wrangler+cmsWrangler,/^\s*(route|routes|bucket_name|account_id|api_token)\s*=/m);
assert.doesNotMatch(wrangler+cmsWrangler,/^\s*\[\[queues\.consumers\]\]/m);
assert.equal(p.scripts.build,"next build");
assert.equal(p.scripts["build:vinext"],"vinext build");
assert.ok(!JSON.stringify(p).includes("adsbygoogle"));
assert.ok(!JSON.stringify(p).includes("ca-pub-"));
process.stdout.write("TUR010 dependency gate PASS: React/RSC, Playwright, axe, Wrangler frozen pins; no live data/bindings/AdSense.\n");
