import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {startLocalText} from '../../../local-text/server.mjs';
import {testProjectionPreview} from './projection-preview-chromium.mjs';
import {testDevicePreview} from './device-preview-chromium.mjs';
import {testUnifiedPreview} from './unified-preview-chromium.mjs';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const out=process.argv[2];assert.ok(out);mkdirSync(out,{recursive:true});
const {server,url}=await startLocalText(0);const browser=await chromium.launch();const evidence=[];
try{
 for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'}),errors=[],unexpected=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(![url,url+'site.js',url+'site.css',url+'favicon.ico'].includes(route.request().url())){unexpected.push(route.request().url());return route.abort()}return route.continue()});
  await page.goto(url);await page.locator('#articles article').first().waitFor();
  assert.equal(await page.locator('#articles article').count(),3);assert.equal(await page.locator('#devices article').count(),4);
  const phoneColumns=await page.locator('#devices').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(phoneColumns,name==='mobile'?2:4);
  assert.equal(await page.locator('#devices button[aria-pressed=true]').count(),2);
  await page.locator('[data-desk=tech]').click();assert.equal(await page.locator('#category').inputValue(),'tech');assert.equal(await page.locator('#articles article').count(),1);
  await page.locator('[data-category=trdef]').click();assert.equal(await page.locator('#category').inputValue(),'trdef');assert.equal(await page.locator('[data-category=trdef]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#articles article').count(),1);
  await page.locator('#articles summary').click();assert.equal(await page.locator('#articles details').getAttribute('open'),'');
  await page.locator('#en').click();assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.match(await page.locator('#articles h3').innerText(),/Fictional/);
  await page.locator('#category').selectOption('globaldef');assert.match(await page.locator('#articles h3').innerText(),/international/);
  await page.locator('#category').selectOption('all');await page.locator('#news-search').fill('display');assert.equal(await page.locator('#articles article').count(),1);await page.locator('#news-search').fill('');
  await page.locator('#phone-search').fill('Vega');assert.equal(await page.locator('#devices article').count(),1);await page.locator('#devices button').click();assert.equal(await page.locator('#right').inputValue(),'c');await page.locator('#phone-search').fill('');
  await page.locator('#right').selectOption('a');assert.match(await page.locator('#compare-status').innerText(),/different/);assert.equal(await page.locator('#compare-coverage').isVisible(),false);
  await page.locator('#right').selectOption('b');assert.equal(await page.locator('#comparison tbody tr').count(),7);assert.match(await page.locator('#compare-coverage-text').innerText(),/7 \/ 7 known specification fields/);
  await page.locator('#diff').check();assert.equal(await page.locator('#comparison tbody tr').count(),6);
  await page.locator('#swap').click();assert.equal(await page.locator('#left').inputValue(),'b');await page.locator('#diff').uncheck();
  assert.match(await page.locator('#dragon').innerText(),/Scores unavailable/);
  assert.equal(await page.locator('img,video,audio,iframe,svg,canvas,object,embed,form').count(),0);
  assert.equal(await page.locator('a:not([href^="#"])').count(),0);
  const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(layout.scroll<=layout.viewport+1);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await page.locator('#tr').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,name+'.png'),fullPage:true});
  evidence.push({name,width,height,layout,externalRequests:unexpected.length,pageErrors:errors.length,news:3,phones:4,languageSwitch:true,comparison:true,mediaElements:0,phoneColumns});
  await page.close();
 }
 evidence.push(...await testProjectionPreview(browser,out));
 evidence.push(...await testDevicePreview(browser,out));
 evidence.push(...await testUnifiedPreview(browser,out));
}finally{await browser.close();await new Promise(r=>server.close(r))}
writeFileSync(join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log('PASS isolated text-only TR/EN technology/defence news, search, comparison, no media/external links, desktop/mobile Chromium');
