import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const file = p => readFileSync(root+p,'utf8');
test('beta contains standalone, static, accessible files and original artwork',()=>{
 const html=file('index.html');
 const css=file('assets/site.css');
 const js=file('assets/site.js');
 assert.ok(statSync(root+'assets/topwhiz-logo.png').size>100000,'original local logo must be committed');
 for(const target of ['./assets/site.css','./assets/site.js','./assets/topwhiz-logo.png']){
  assert.ok(html.includes(target),'missing local asset '+target);
 }
 for(const id of ['device-cards','search','left-device','right-device','compare-output','result-count']){
  assert.ok(html.includes('id="'+id+'"'),'missing wired element '+id);
 }
 assert.match(html,/lang="tr"/);
 assert.match(html,/noindex,nofollow,noarchive/);
 assert.match(html,/BETA/);
 assert.match(html,/kurgusaldır/);
 assert.match(html,/aria-live="polite"/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(js,/aria-pressed/);
 assert.match(js,/renderComparison\(\)/);
});
test('beta has no remote data, tracking, payment, CMS, media service or true price feeds',()=>{
 const html=file('index.html'),js=file('assets/site.js');
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|document\.cookie/);
 assert.doesNotMatch(html,/src="https?:\/\//);
 const externalLinks=[...html.matchAll(/href="https?:\/\/([^/"]+)/g)].map(m=>m[1]);
 assert.deepEqual(externalLinks,["github.com"]);
 assert.doesNotMatch(html,/AdSense|google-analytics|stripe|R2_BUCKET|MERCHANT_OFFER/);
 assert.ok(!js.includes('purchaseUrl'));
 assert.ok(js.includes('FICTIONAL'));
});
test('published preview is crawler-denied and locked down by both provider configs',()=>{
 assert.match(file('robots.txt'),/Disallow: \/\s*$/m);
 const headers=file('_headers');
 const vercel=JSON.parse(file('vercel.json'));
 assert.match(headers,/X-Robots-Tag: noindex/);
 assert.match(headers,/connect-src 'none'/);
 assert.match(headers,/frame-ancestors 'none'/);
 const header=Object.fromEntries(vercel.headers[0].headers.map(x=>[x.key,x.value]));
 assert.match(header['X-Robots-Tag'],/noindex/);
 assert.match(header['Content-Security-Policy'],/connect-src 'none'/);
});
