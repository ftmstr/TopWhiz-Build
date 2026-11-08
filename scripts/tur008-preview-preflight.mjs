import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const config=read("services/prices-worker/wrangler.cms.preview.example.toml");
const active=read("services/prices-worker/wrangler.cms.toml");
const pkg=JSON.parse(read("services/prices-worker/package.json"));
const registry=JSON.parse(read("apps/web/data/published-content.json"));
const current=pkg.devDependencies?.wrangler;
const [maj,min]=String(current).split(".").map(Number);
assert.ok(config.includes("workers_dev = false"));
assert.match(config,/dead_letter_queue\s*=\s*"topwhiz-preview-cms-purge-dlq"/);
assert.doesNotMatch(config,/ca-pub-\d+|auth_token\s*=/i);
assert.doesNotMatch(active,/^\s*\[\[queues\.consumers\]\]/m);
assert.deepEqual(registry,{news:[],phones:[]});
const readyVersion=Number.isFinite(maj)&&Number.isFinite(min)&&
  (maj>4||(maj===4&&min>=135));
if(process.argv[2]!=="static")throw Error("No deployment mode is supported by this script");
process.stdout.write(JSON.stringify({
  check:"plan_only",safeSample:true,realPreviewCreated:false,
  wranglerPinned:current,cloudflarePreviewsCliReady:readyVersion,
  blocker:readyVersion?null:"Wrangler >=4.135 required for Workers Previews",
  noProductionBindings:true,noAds:true,emptyRegistry:true
})+"\n");
