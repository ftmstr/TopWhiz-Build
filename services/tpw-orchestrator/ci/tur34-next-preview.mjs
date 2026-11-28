import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const [runtime,out]=process.argv.slice(2);
assert.ok(['next','workerd'].includes(runtime)&&out);
const base='http://127.0.0.1:'+(runtime==='next'?3134:3116);
const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
assert.equal(head,process.env.TOPWHIZ_EXPECTED_HEAD);assert.match(head,/^[a-f0-9]{40}$/);
mkdirSync(out,{recursive:true});
let response;
for(let i=0;i<100;i++){try{response=await fetch(base+'/tpw-ci-preview/tr',{signal:AbortSignal.timeout(2000)});if(response.status===200)break}catch{}await sleep(500)}
assert.equal(response?.status,200,'CI preview route not ready');
const body=await response.text();assert.match(body,/noindex/i);assert.match(body,/KURGUSAL TASARIM/);assert.doesNotMatch(body,/adsbygoogle\.js|postgresql:\/\//);
assert.equal((await fetch(base+'/tpw-ci-preview/zz')).status,404);
const browser=await chromium.launch(), evidence=[];
try{
 for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]]){
  for(const lang of ['tr','en']){
   const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile',reducedMotion:'reduce'}),errors=[],external=[],unexpected=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base){external.push(u.href);return route.abort()}if(!u.pathname.startsWith('/_next/')&&!u.pathname.startsWith('/assets/')&&!u.pathname.startsWith('/tpw-ci-preview/')&&u.pathname!=='/favicon.ico'){unexpected.push(u.pathname);return route.abort()}return route.continue()});
   try{
    const res=await page.goto(base+'/tpw-ci-preview/'+lang);assert.equal(res.status(),200);
    await page.waitForFunction(l=>document.documentElement.lang===l,lang);
    assert.equal(await page.locator('[data-preview=synthetic-only]').getAttribute('lang'),lang);
    assert.equal(await page.locator('#tpw34-news article').count(),3);assert.equal(await page.locator('#tpw34-phones article').count(),3);
    assert.equal(await page.locator('#tpw34-phones meter').count(),3);assert.deepEqual(await page.locator('#tpw34-phones meter').evaluateAll(ms=>ms.map(m=>[m.value,m.max])),[[1,7],[1,7],[3,7]]);
    const search=page.locator('#tpw34-news input[type=search]');await search.fill('NO_MATCH_TUR36');assert.equal(await page.locator('#tpw34-news article').count(),0);await search.fill('');assert.equal(await page.locator('#tpw34-news article').count(),3);
    const ps=page.locator('#tpw34-phones input[type=search]');await ps.fill('EX-002');assert.equal(await page.locator('#tpw34-phones article').count(),1);await ps.fill('');assert.equal(await page.locator('#tpw34-phones article').count(),3);
    await page.locator('button[data-cat=trdef]').click();assert.equal(await page.locator('#tpw34-news article').count(),1);
    await page.locator('button[data-cat=all]').click();assert.equal(await page.locator('#tpw34-news article').count(),3);
    await page.locator('#tpw34-diff').check();assert.equal(await page.locator('#tpw34-compare tbody tr').count(),1);await page.locator('#tpw34-diff').uncheck();
    await page.locator('#tpw34-right').selectOption('tr');assert.equal(await page.locator('#tpw34-compare table').count(),0);await page.locator('#tpw34-right').selectOption('us');
    await page.locator('#tpw34-swap').click();assert.equal(await page.locator('#tpw34-left').inputValue(),'us');await page.locator('#tpw34-swap').click();
    assert.match(await page.locator('#tpw34-compare').innerText(),lang==='tr'?/Bilinmiyor/:/Unknown/);
    assert.equal(await page.locator('[data-dp-state=DISABLED]').count(),1);
    if(name==='mobile'){assert.equal(await page.locator('#tpw34-navlinks').isVisible(),false);await page.locator('.tpw34-menu').click();assert.equal(await page.locator('#tpw34-navlinks').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#tpw34-navlinks').isVisible(),false);assert.equal(await page.locator('.tpw34-menu').evaluate(el=>el===document.activeElement),true)}
    for(const theme of ['dark','light']){
     if(theme==='light')await page.locator('#tpw34-theme').click();
     assert.equal(await page.locator('.tpw34').getAttribute('data-theme'),theme);
     const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
     assert.ok(layout.scroll<=layout.viewport+1);assert.equal(await page.locator('.tpw34 img,.tpw34 video,.tpw34 iframe,.tpw34 canvas,.tpw34 form').count(),0);
     assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(unexpected,[]);
     await page.evaluate(()=>scrollTo(0,0));const file=name+'-'+lang+'-'+theme+'.png';await page.screenshot({path:join(out,file),fullPage:true,animations:'disabled'});const bytes=readFileSync(join(out,file));assert.ok(bytes.length>1000);
     evidence.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),lang,theme,width,height,layout,externalRequests:0,pageErrors:0});
    }
    await page.locator('a[hreflang="'+(lang==='tr'?'en':'tr')+'"]').click();await page.waitForFunction(l=>document.documentElement.lang===l,lang==='tr'?'en':'tr');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   }finally{await page.close()}
  }
 }
 assert.equal(evidence.length,8);writeFileSync(join(out,'evidence.json'),JSON.stringify({head,runtime,chromium:browser.version(),fixtureOnly:true,livePublication:'HARD_NO_GO',signedD1Integration:'NOT_CONNECTED',cspEnforcement:'NOT_VERIFIED',evidence},null,2)+'\n');
 console.log('PASS TUR34 '+runtime+' actual Chromium eight screenshots, synthetic UI, no external browser requests, hydration and interactions');
}finally{await browser.close()}
