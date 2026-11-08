import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const root=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const web=JSON.parse(root("apps/web/package.json"));
const prices=JSON.parse(root("services/prices-worker/package.json"));
const lock=root("pnpm-lock.yaml");
const cfg=root("apps/web/vite.workerd.config.ts");
assert.equal(web.devDependencies["@cloudflare/vite-plugin"],"1.67.0");
assert.equal(web.devDependencies.vite,"8.3.6");
assert.equal(web.devDependencies.wrangler,"4.158.0");
assert.equal(prices.devDependencies.wrangler,"4.158.0");
assert.ok(lock.includes("'@cloudflare/vite-plugin':\n        specifier: 1.67.0"),
  "Cloudflare Vite plugin pin missing from frozen lockfile");
assert.ok(lock.includes("wrangler:\n        specifier: 4.158.0"),
  "Wrangler lockfile not upgraded");
assert.ok(cfg.includes('viteEnvironment:{name:"rsc",childEnvironments:["ssr"]}'));
assert.ok(cfg.includes("remoteBindings:false"));
assert.ok(cfg.includes("workers_dev:false"));
assert.ok(cfg.includes('compatibility_date:"2026-09-25"'));
assert.ok(!cfg.includes("CLOUDFLARE_API_TOKEN"));
assert.ok(!cfg.includes("D1:")&&!cfg.includes("R2:"));
assert.ok(!existsSync(new URL("../apps/web/.dev.vars",import.meta.url)));
assert.deepEqual(JSON.parse(root("apps/web/data/published-content.json")),{news:[],phones:[]});
process.stdout.write("TUR011 PASS: Cloudflare Vite/Workerd isolated, zero production bindings and frozen versions.\n");
