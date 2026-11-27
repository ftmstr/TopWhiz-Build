/** TUR30: actual exact-checkout signed local D1 design on Windows and Ubuntu. */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const root=fileURLToPath(new URL('../../../',import.meta.url));
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});assert.equal(git.status,0);const sha=git.stdout.trim();assert.match(sha,/^[a-f0-9]{40}$/);assert.ok(process.env.TOPWHIZ_EXPECTED_HEAD,'EXPECTED_HEAD_REQUIRED');assert.equal(sha,process.env.TOPWHIZ_EXPECTED_HEAD,'EXACT_PR_HEAD_REQUIRED');
const out=process.argv[2];assert.ok(out);mkdirSync(out,{recursive:true});
const child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/unified-demo.mjs',import.meta.url))],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
let output='',errors='',exit,url,browser,version;
const exited=new Promise(resolve=>{child.once('error',error=>{exit={error};resolve(exit)});child.once('exit',(code,signal)=>{exit={code,signal};resolve(exit)})});
child.stdout.on('data',b=>{output+=b;process.stdout.write(b)});child.stderr.on('data',b=>{errors+=b;process.stderr.write(b)});child.stdin.on('error',()=>{});
const evidence=[];
try{
 const deadline=Date.now()+60000;
 while(!(url=output.match(/^TOPWHIZ_READY (http:\/\/127\.0\.0\.1:\d+\/)\r?$/m)?.[1])){if(exit||Date.now()>deadline)throw Error('TUR30_READY '+errors);await sleep(100)}
 browser=await chromium.launch();version=browser.version();
 for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'}),pageErrors=[],external=[];
  page.on('pageerror',e=>pageErrors.push(e.message));page.on('dialog',d=>{pageErrors.push('dialog');void d.dismiss()});
  await page.route('**/*',route=>{if(![url,url+'site.js',url+'site.css',url+'favicon.ico'].includes(route.request().url())){external.push(route.request().url());return route.abort()}return route.continue()});
  try{
   const res=await page.goto(url);assert.equal(res.status(),200);assert.match(res.headers()['content-security-policy'],/connect-src 'none'/);
   assert.equal(await page.locator('html').getAttribute('data-design'),'tur31');
   assert.equal(await page.locator('#articles article').count(),2);assert.equal(await page.locator('#devices article').count(),2);
   assert.equal(await page.locator('#category').isDisabled(),true);assert.equal(await page.locator('[data-category]:disabled').count(),4);
   assert.equal(await page.locator('#category-note').isVisible(),true);
   assert.equal(await page.locator('.category-tabs').isVisible(),false);assert.equal(await page.locator('#category').isVisible(),false);
   assert.equal(await page.locator('#articles article[data-category=uncategorized]').count(),2);
   assert.equal(await page.locator('#devices').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
   assert.equal(await page.locator('#devices .spec-coverage').count(),2);
   assert.equal(await page.locator('#compare-coverage').isVisible(),true);
   assert.match(await page.locator('#comparison').innerText(),/EX-001 \/ TR/);assert.match(await page.locator('#comparison').innerText(),/EX-001 \/ US/);
   assert.match(await page.locator('#comparison').innerText(),/6\.7 inch/);assert.doesNotMatch(await page.locator('#comparison').innerText(),/6\.1 inch/);
   if(name==='mobile'){
    assert.equal(await page.locator('#main-nav').isVisible(),false);
    await page.locator('#menu').click();assert.equal(await page.locator('#main-nav').isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#main-nav').isVisible(),false);
    await page.locator('#menu').click();await page.locator('#main-nav a[href="#phones"]').click();assert.equal(await page.locator('#main-nav').isVisible(),false);
   }else assert.equal(await page.locator('#main-nav').isVisible(),true);
   const backgrounds=new Set();
   for(const theme of ['dark','light']){
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#theme').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
    assert.equal(await page.locator('#theme').getAttribute('aria-pressed'),String(theme==='dark'));
    const bg=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);backgrounds.add(bg);
    for(const lang of ['tr','en']){
     await page.locator('#'+lang).click();assert.equal(await page.locator('html').getAttribute('lang'),lang);
     assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
     assert.match(await page.locator('#articles h3').first().innerText(),lang==='tr'?/Kurgusal CURRENT/:/Fictional CURRENT/);
     assert.match(await page.locator('#comparison').innerText(),lang==='tr'?/Bilinmiyor/:/Unknown/);
     assert.match(await page.locator('#compare-coverage-text').innerText(),lang==='tr'?/1 \/ 7 bilinen teknik alan/:/1 \/ 7 known specification fields/);
     assert.match(await page.locator('#compare-coverage').innerText(),lang==='tr'?/puan veya sıralama değildir/:/not a score or ranking/);
     assert.match(await page.locator('#dragon').innerText(),lang==='tr'?/Puanlar kullanılamıyor/:/Scores unavailable/);
     assert.equal(await page.locator('.method-stats strong').allTextContents().then(x=>x.join(',')),'8,37,1000');
     assert.equal(await page.locator('img,video,audio,iframe,svg,canvas,object,embed,form').count(),0);
     assert.equal(await page.locator('a:not([href^="#"])').count(),0);
     const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
     assert.ok(layout.scroll<=layout.viewport+1);assert.deepEqual(pageErrors,[]);assert.deepEqual(external,[]);
     await page.evaluate(()=>scrollTo(0,0));
     const file=name+'-'+lang+'-'+theme+'.png',path=join(out,file);
     await page.screenshot({path,fullPage:true,animations:'disabled'});const bytes=readFileSync(path);assert.ok(bytes.length>1000);
     evidence.push({name,lang,theme,width,height,layout,background:bg,news:2,phones:2,externalRequests:0,pageErrors:0,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
   }
   assert.equal(backgrounds.size,2);
  }finally{await page.close()}
 }
 await browser.close();browser=null;
 child.stdin.write('stop\n');
 const done=await Promise.race([exited,sleep(20000,undefined,{ref:false}).then(()=>{throw Error('TUR30_STOP_TIMEOUT')})]);
 assert.equal(done.code,0);assert.equal(done.signal,null);assert.match(output,/TOPWHIZ_STOPPED/);
 await assert.rejects(fetch(url,{signal:AbortSignal.timeout(5000)}));assert.equal(evidence.length,8);
 writeFileSync(join(out,'evidence.json'),JSON.stringify({head:sha,platform:process.platform,chromium:version,design:'tur31',physicalWindows:'NOT_RUN',hostOffline:'NOT_VERIFIED',stopAndClosedPort:true,evidence},null,2)+'\n');
 console.log('PASS TUR31 exact PR HEAD signed D1 design '+process.platform+' eight TR/EN dark/light desktop/mobile screenshots; menu and category gate preserved');
}finally{if(browser)await browser.close();if(!exit){child.stdin.write('stop\n');await Promise.race([exited,sleep(5000,undefined,{ref:false})]);if(!exit&&child.pid){if(process.platform==='win32')spawnSync('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore'});else child.kill();}}}
