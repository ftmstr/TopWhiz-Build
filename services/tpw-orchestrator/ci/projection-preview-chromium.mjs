/** Real local D1 -> loopback HTML -> real Chromium. Synthetic sources only. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {candidateDigest} from '../src/lineage.mjs';
import {createNewsProjectionFixture} from './news-projection-d1.mjs';
import {projectLocalNews} from '../src/news-projection.mjs';
import {startLocalProjectionPreview} from '../src/local-news-view.mjs';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const at='2026-11-23T00:00:00Z',hash='a'.repeat(64);
const news={kind:'news',source:{url:'https://official.example.org/synthetic',publisher:'Synthetic manufacturer',rights:'LINK_ONLY',type:'PRIMARY'},observedAt:at,title:'Synthetic preview fixture'};
const makeDoc=async c=>({schemaVersion:'1.0',id:c.id,kind:c.kind,status:'APPROVED',title:{tr:'Sentetik teknik duyuru',en:'Synthetic technical announcement'},summary:{tr:'Bu yalnızca yerel çalıştırma için hazırlanmış sentetik bir kayıttır.',en:'This record exists only for synthetic local acceptance testing.'},body:{tr:'Tamamen kurgusal bir metindir; gerçek bir marka, ürün, olay veya haber iddiası içermez.',en:'This entirely synthetic sample does not make any real product, manufacturer or news claim.'},sources:[{...c.source,checkedAt:at,claimHash:hash},{url:'https://independent.example.net/lab',publisher:'Synthetic laboratory',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:hash}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:hash},media:[],publishedAt:at,sourceDigest:await candidateDigest(c),...(c.kind==='device'?{device:{...c.device,specifications:{screen:{value:'6.3',unit:'inch',sourceHash:hash}}}}:{})});
export async function testProjectionPreview(browser,out){
 const {getPlatformProxy}=await import(pathToFileURL(require.resolve('wrangler')).href);
 const platform=await getPlatformProxy({configPath:fileURLToPath(new URL('../wrangler.ci-d1.jsonc',import.meta.url)),persist:false,remoteBindings:false});
 let server;
 try{
  const db=platform.env.TPW_DB;
  for(const name of ['0006_tpw_local_news_projection.sql','0007_tpw_projection_evidence.sql'])for(const stmt of readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').replace(/^--[^\n]*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(stmt).run();
  const label=c=>c.id.includes('_a_')?'FIRST':'CURRENT';
  const {env,signed}=createNewsProjectionFixture(db,async c=>{
   const d=await makeDoc(c);d.title={tr:'Kurgusal '+label(c)+' başlık',en:'Fictional '+label(c)+' headline'};
   d.body.tr='Sentetik XSS sınaması: </template><img src="https://example.org/x" onerror="alert(1)"> ve &lt; metin.';
   return d;
  },news);
  const started=await startLocalProjectionPreview(env);server=started.server;const url=started.url;
  assert.equal((await fetch(url)).status,503);
  const a=await signed(1,null,'a',201),first=await projectLocalNews(a);
  const b=await signed(2,first.operationId,'b',202);await projectLocalNews(b);
  const evidence=[];
  for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]]){
   const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'}),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',d=>{errors.push('unexpected dialog');void d.dismiss()});
   await page.route('**/*',route=>{if(![url,url+'site.js',url+'site.css',url+'favicon.ico'].includes(route.request().url())){external.push(route.request().url());return route.abort()}return route.continue()});
   try{
    const response=await page.goto(url);assert.equal(response.status(),200);assert.match(response.headers()['content-security-policy'],/connect-src 'none'/);
    await page.locator('#articles article').first().waitFor();
    assert.equal(await page.locator('#articles article').count(),2);assert.match(await page.locator('#news-count').innerText(),/Yerel nesil 2/);
    assert.ok((await page.locator('#articles h3').allTextContents()).every(x=>x.includes('CURRENT')));
    assert.equal(await page.locator('#category').isDisabled(),true);
    await page.locator('#articles summary').first().click();assert.match(await page.locator('#articles details p').first().innerText(),/<\/template><img/);
    assert.equal(await page.locator('img,iframe,video,object,embed').count(),0);
    await page.locator('#en').click();assert.match(await page.locator('#articles h3').first().innerText(),/Fictional CURRENT/);
    await page.locator('#news-search').fill('not present');assert.equal(await page.locator('#articles article').count(),0);
    await page.locator('#news-search').fill('');assert.equal(await page.locator('#articles article').count(),2);
    assert.equal(await page.locator('a:not([href^="#"])').count(),0);
    const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(layout.scroll<=layout.viewport+1);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await page.locator('#tr').click();await page.screenshot({path:join(out,'projection-'+name+'.png'),fullPage:true});
    evidence.push({name,width,height,generation:2,news:2,externalRequests:0,pageErrors:0,layout});
   }finally{await page.close()}
  }
  assert.equal((await fetch(url+'api/news')).status,404);
  // A partial or corrupted current snapshot must not show the old generation or static examples.
  const current=(await db.prepare('SELECT operation_id FROM tpw_news_projection_head WHERE singleton=1').first()).operation_id;
  await db.prepare('UPDATE tpw_news_projection_rows SET document_json=? WHERE operation_id=?').bind('{}',current).run();
  const denied=await fetch(url);assert.equal(denied.status,503);assert.equal((await denied.arrayBuffer()).byteLength,0);
  console.log('PASS genuine local D1 to loopback TR/EN projection Chromium desktop/mobile, current generation only, escaped XSS, zero external requests, corrupt snapshot fail closed');
  return evidence;
 }finally{if(server)await new Promise(r=>server.close(r));await platform.dispose()}
}
