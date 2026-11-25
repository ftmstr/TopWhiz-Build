/** Actual Chromium acceptance of CLI-generated local static HTML. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const out=resolve(process.argv[2]??'');
assert.ok(process.argv.length===3);
const browser=await chromium.launch({headless:true});
const evidence=[];
try{
 for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:name==='mobile',hasTouch:name==='mobile'});
  const external=[],errors=[];
  page.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url())});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/i,route=>route.abort());
  await page.goto(pathToFileURL(join(out,'operations.html')).href);
  await page.getByRole('heading',{name:'TOPWHIZ / LOCAL OPERATIONS'}).waitFor();
  assert.equal(await page.locator('table').count(),2);
  assert.equal(await page.locator('table').nth(1).locator('tbody tr').count(),28);
  assert.match(await page.locator('body').innerText(),/HARD NO-GO/);
  assert.match(await page.locator('body').innerText(),/LOCAL_READ_OK/);
  const actual=await page.locator('table').first().locator('tbody tr').allTextContents();
  assert.deepEqual(actual,['TPW1010','TPW3010','TPW2010']);
  assert.equal(await page.locator('script,form,iframe').count(),0);
  const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(layout.scroll<=layout.viewport+1,'HORIZONTAL_OVERFLOW');
  assert.equal(external.length,0);assert.equal(errors.length,0);
  await page.screenshot({path:join(out,name+'.png'),fullPage:true});
  evidence.push({name,width,height,layout,externalRequests:0,pageErrors:0,inventoryRows:28});
  await page.close();
 }
}finally{await browser.close()}
writeFileSync(join(out,'chromium-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log('PASS real Chromium desktop 1920x1080 and mobile 390x844; no horizontal overflow or external requests');
