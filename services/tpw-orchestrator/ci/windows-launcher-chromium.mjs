import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {checkedLoopback,launchWindowsDemo} from '../../../local-text/TOPWHIZ-TARAYICI.mjs';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
assert.equal(process.platform,'win32');
for(const bad of ['https://127.0.0.1:1234/','http://localhost:1234/','http://127.0.0.1:1234/?x=1','http://127.0.0.1:1234/@evil','http://127.0.0.1:65536/','http://127.0.0.1:80/'])assert.throws(()=>checkedLoopback(bad));
assert.equal(checkedLoopback('http://127.0.0.1:1234/'),'http://127.0.0.1:1234/');
const out=process.argv[2];assert.ok(out);mkdirSync(out,{recursive:true});
const input=new PassThrough(),evidence=[];
let opens=0,version;
await launchWindowsDemo({input,openBrowser:async url=>{
 opens++;
 const browser=await chromium.launch({headless:true});version=browser.version();
 try{
  for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]]){
   const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'}),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('dialog');void d.dismiss()});
   await page.route('**/*',route=>{if(![url,url+'site.js',url+'site.css',url+'favicon.ico'].includes(route.request().url())){external.push(route.request().url());return route.abort()}return route.continue()});
   try{
    const res=await page.goto(url);assert.equal(res.status(),200);assert.match(res.headers()['content-security-policy'],/connect-src 'none'/);
    assert.equal(await page.locator('#articles article').count(),2);assert.equal(await page.locator('#devices article').count(),2);
    assert.equal(await page.locator('#category').isDisabled(),true);
    assert.match(await page.locator('#comparison').innerText(),/EX-001 \/ TR/);
    assert.match(await page.locator('#comparison').innerText(),/EX-001 \/ US/);
    assert.match(await page.locator('#comparison').innerText(),/6\.7 inch/);
    assert.doesNotMatch(await page.locator('#comparison').innerText(),/6\.1 inch/);
    for(const lang of ['tr','en']){
     await page.locator('#'+lang).click();assert.equal(await page.locator('html').getAttribute('lang'),lang);
     assert.match(await page.locator('#articles h3').first().innerText(),lang==='tr'?/Kurgusal CURRENT/:/Fictional CURRENT/);
     assert.match(await page.locator('#comparison').innerText(),lang==='tr'?/Bilinmiyor/:/Unknown/);
     assert.match(await page.locator('#dragon').innerText(),lang==='tr'?/Puanlar kullanılamıyor/:/Scores unavailable/);
     assert.equal(await page.locator('img,iframe,video,object,embed').count(),0);
     const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
     assert.ok(layout.scroll<=layout.viewport+1);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
     await page.evaluate(()=>scrollTo(0,0));
     const file=name+'-'+lang+'.png',path=join(out,file);
     await page.screenshot({path,fullPage:true,animations:'disabled'});
     const bytes=readFileSync(path);assert.ok(bytes.length>1000);
     evidence.push({name,lang,width,height,layout,news:2,phones:2,externalRequests:0,pageErrors:0,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
   }finally{await page.close()}
  }
 }finally{await browser.close()}
 input.write('\n');
}});
assert.equal(opens,1);assert.equal(evidence.length,4);
writeFileSync(join(out,'evidence.json'),JSON.stringify({platform:process.platform,chromium:version,launcherOpenCount:opens,defaultBrowserAssociation:'NOT_RUN',physicalWindows:'NOT_RUN',hostOffline:'NOT_VERIFIED',stopAndClosedPort:true,evidence},null,2)+'\n');
console.log('PASS Windows launcher + actual Chromium desktop/mobile TR/EN four screenshots; default browser association NOT_RUN');
