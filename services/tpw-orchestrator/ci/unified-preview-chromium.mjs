/** Both signed models in one real local D1, one loopback HTTP response. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {candidateDigest} from '../src/lineage.mjs';
import {canonicalBytes} from '../src/canonical.mjs';
import {b64url,grantMessage,editorMessage} from '../src/revision-proofs.mjs';
import {stageCandidates,claimStage} from '../src/staging.mjs';
import {slotWindow} from '../src/hourly.mjs';
import {appendReviewedRevision} from '../src/revision-ledger.mjs';
import {applyRevocation,revokeMessage} from '../src/revision-authority.mjs';
import {createNewsProjectionFixture} from './news-projection-d1.mjs';
import {projectLocalNews} from '../src/news-projection.mjs';
import {startUnifiedPreview,loadUnifiedView} from '../src/local-unified-view.mjs';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const at='2026-11-23T00:00:00Z',hash='a'.repeat(64);
const makeDoc=async c=>({schemaVersion:'1.0',id:c.id,kind:c.kind,status:'APPROVED',title:{tr:'Sentetik teknik duyuru',en:'Synthetic technical announcement'},summary:{tr:'Bu yalnızca yerel çalıştırma için hazırlanmış sentetik bir kayıttır.',en:'This record exists only for synthetic local acceptance testing.'},body:{tr:'Tamamen kurgusal bir metindir; gerçek bir marka, ürün, olay veya haber iddiası içermez.',en:'This entirely synthetic sample does not make any real product, manufacturer or news claim.'},sources:[{...c.source,checkedAt:at,claimHash:hash},{url:'https://independent.example.net/lab',publisher:'Synthetic laboratory',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:hash}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:hash},media:[],publishedAt:at,sourceDigest:await candidateDigest(c),...(c.kind==='device'?{device:{...c.device,specifications:{screen:{value:'6.3',unit:'inch',sourceHash:hash}}}}:{})});
export async function testUnifiedPreview(browser,out){
 const {getPlatformProxy}=await import(pathToFileURL(require.resolve('wrangler')).href);
 const platform=await getPlatformProxy({configPath:fileURLToPath(new URL('../wrangler.ci-d1.jsonc',import.meta.url)),persist:false,remoteBindings:false});
 let server;
 try{
  const db=platform.env.TPW_DB;
  for(const name of ['0001_tpw_stage.sql','0002_tpw_hourly.sql','0003_tpw_revisions.sql','0004_tpw_revision_proofs.sql','0005_tpw_revision_authority.sql','0006_tpw_local_news_projection.sql','0007_tpw_projection_evidence.sql','0008_tpw_device_evidence.sql'])for(const stmt of readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').replace(/^--[^\n]*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(stmt).run();
  const keys=await Promise.all([0,1,2].map(()=>crypto.subtle.generateKey('Ed25519',true,['sign','verify'])));
  const pins=await Promise.all(keys.map(k=>crypto.subtle.exportKey('raw',k.publicKey).then(b64url)));
  const env={TPW_DB:db,TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED',TPW_EDITOR_PUBLIC_KEY:pins[0],TPW_LICENSE_PUBLIC_KEY:pins[1],TPW_REVOCATION_PUBLIC_KEY:pins[2]};
  const sign=async(k,msg)=>b64url(await crypto.subtle.sign('Ed25519',k.privateKey,canonicalBytes(msg)));
  const slot='2026112307',clock=slotWindow('TPW2',slot).start+1,expiry=clock+3600000,scope={slot,owner:'synthetic-device-preview',guard:async()=>{}};
  let now=clock+1;
  await db.prepare("INSERT INTO tpw_hourly_run(slot,agent,state,owner,started_at,deadline) VALUES (?,'TPW2','RUNNING',?,?,?)").bind(slot,scope.owner,clock,slotWindow('TPW2',slot).end).run();
  const source={url:'https://official.example.org/synthetic',publisher:'Synthetic manufacturer',rights:'LINK_ONLY',type:'PRIMARY'};
  const append=async(id,region,screen,expectedHead,{epoch=0,grantExpiry=expiry,dbOverride=db,prepareOnly=false}={})=>{
   const c={id:'device_preview_'+id,kind:'device',source,observedAt:at,title:'Synthetic device preview',device:{brand:'Example',model:'Demo P',sku:'EX-001',region}};
   await stageCandidates(db,[c],clock,scope);
   const owned=await claimStage(db,c.id,crypto.randomUUID(),clock,slot);
   const article=await makeDoc(c);article.device.specifications.screen.value=screen;
   const grants=await Promise.all(article.sources.map(async s=>({expiresAt:grantExpiry,signature:await sign(keys[1],grantMessage(s,grantExpiry))})));
   const proof={epoch,grants,editorSignature:await sign(keys[0],editorMessage(article,expectedHead,slot,grants,epoch))};
   const retry=()=>appendReviewedRevision({env:{...env,TPW_DB:dbOverride},owned,article,expectedHead,scope,proof,nowFn:()=>now});
   if(prepareOnly)return {retry,article,proof};
   const result=await retry();
   return {result,article,proof,retry};
  };
  const first=await append('old','TR','6.1',null);
  const current=await append('new','TR','6.7',first.result.revisionHash);
  const other=await append('other','US','6.5',null);

  const news={kind:'news',source,observedAt:at,title:'Synthetic unified news'};
  const fixture=createNewsProjectionFixture(db,async c=>{
   const d=await makeDoc(c),label=c.id.includes('_a_')?'OLD':'CURRENT';
   d.title={tr:'Kurgusal '+label+' haber',en:'Fictional '+label+' news'};
   d.body.tr='Sentetik XSS sınaması: </template><img src="https://example.org/x" onerror="alert(1)"> ve &lt; metin.';
   return d;
  },news);
  const combined={...env,...fixture.env};
  // The news fixture has its own CI, authority and P256 editor pins; the device keys remain distinct.
  const started=await startUnifiedPreview(combined,0,()=>now);server=started.server;const url=started.url;
  const denied=async()=>{const res=await fetch(url);assert.equal(res.status,503);assert.equal((await res.arrayBuffer()).byteLength,0)};
  await denied(); // devices alone are insufficient.
  const n1=await fixture.signed(1,null,'a',301),r1=await projectLocalNews(n1);
  const n2=await fixture.signed(2,r1.operationId,'b',302),r2=await projectLocalNews(n2);
  const evidence=[];
  for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]]){
   const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'}),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('dialog');void d.dismiss()});
   await page.route('**/*',route=>{if(![url,url+'site.js',url+'site.css',url+'favicon.ico'].includes(route.request().url())){external.push(route.request().url());return route.abort()}return route.continue()});
   try{
    const res=await page.goto(url);assert.equal(res.status(),200);assert.match(res.headers()['content-security-policy'],/connect-src 'none'/);
    assert.equal(await page.locator('#articles article').count(),2);assert.equal(await page.locator('#devices article').count(),2);
    assert.match(await page.locator('#news-count').innerText(),/Yerel nesil 2/);assert.equal(await page.locator('#category').isDisabled(),true);
    assert.ok((await page.locator('#articles h3').allTextContents()).every(x=>x.includes('CURRENT')));
    const table=await page.locator('#comparison').innerText();assert.match(table,/EX-001 \/ TR/);assert.match(table,/EX-001 \/ US/);assert.match(table,/6\.7 inch/);assert.doesNotMatch(table,/6\.1 inch/);assert.match(table,/Bilinmiyor/);
    await page.locator('#articles summary').first().click();assert.match(await page.locator('#articles details p').first().innerText(),/<\/template><img/);
    assert.equal(await page.locator('img,iframe,video,object,embed').count(),0);
    await page.locator('#en').click();assert.match(await page.locator('#articles h3').first().innerText(),/Fictional CURRENT/);assert.match(await page.locator('#comparison').innerText(),/Unknown/);assert.match(await page.locator('#dragon').innerText(),/Scores unavailable/);
    await page.locator('#diff').check();assert.equal(await page.locator('#comparison tbody tr').count(),1);
    await page.locator('#diff').uncheck();await page.locator('#tr').click();
    const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.viewport+1);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await page.screenshot({path:join(out,'unified-'+name+'.png'),fullPage:true});evidence.push({name,width,height,news:2,phones:2,generation:2,externalRequests:0,pageErrors:0,layout});
   }finally{await page.close()}
  }
  // Independent corruptions, no stale/static fallback. Restore only test-owned fixtures.
  const row=await db.prepare('SELECT path,document_json FROM tpw_news_projection_rows WHERE operation_id=? ORDER BY path LIMIT 1').bind(r2.operationId).first();
  await db.prepare('UPDATE tpw_news_projection_rows SET document_json=? WHERE operation_id=? AND path=?').bind('{}',r2.operationId,row.path).run();await denied();
  await db.prepare('UPDATE tpw_news_projection_rows SET document_json=? WHERE operation_id=? AND path=?').bind(row.document_json,r2.operationId,row.path).run();
  const rev=current.result.revisionHash,saved=await db.prepare('SELECT article_json FROM tpw_device_evidence WHERE revision_hash=?').bind(rev).first();
  await db.prepare('UPDATE tpw_device_evidence SET article_json=? WHERE revision_hash=?').bind('{}',rev).run();await denied();
  await db.prepare('UPDATE tpw_device_evidence SET article_json=? WHERE revision_hash=?').bind(saved.article_json,rev).run();
  assert.equal((await fetch(url)).status,200);
  // Interpose an actual signed commit AFTER the news reader obtains its rows.
  const n3=await fixture.signed(3,r2.operationId,'c',303);
  let fired=false;
  const interpose=(needle,change)=>({prepare(sql){const stmt=db.prepare(sql);if(!sql.includes(needle))return stmt;return {async all(){const result=await stmt.all();if(!fired){fired=true;await change()}return result}}}});
  await assert.rejects(loadUnifiedView({...combined,TPW_DB:interpose('r.document_json FROM',()=>projectLocalNews(n3))},()=>now),/UNIFIED_CHANGED/);assert.equal(fired,true);
  assert.match(await (await fetch(url)).text(),/"generation":3/);
  // Advance signed revocation epoch after a device snapshot has been read.
  fired=false;const token=await candidateDigest(grantMessage(current.article.sources[0],expiry));
  await assert.rejects(loadUnifiedView({...combined,TPW_DB:interpose('e.article_json,e.proof_json,z.epoch',()=>applyRevocation({env,token,epoch:0,signature:undefined,nowFn:()=>now}))},()=>now));
  // Exercise a valid independent admin signature rather than relying on a rejected mutation.
  const signature=await sign(keys[2],revokeMessage(token,0));
  fired=false;
  await assert.rejects(loadUnifiedView({...combined,TPW_DB:interpose('e.article_json,e.proof_json,z.epoch',()=>applyRevocation({env,token,epoch:0,signature,nowFn:()=>now}))},()=>now),/DEVICE_VIEW_REVOKED|DEVICE_VIEW_CHANGED|UNIFIED_CHANGED/);assert.equal(fired,true);
  await denied();assert.equal((await fetch(url+'api/news')).status,404);
  console.log('PASS unified local D1 news and device preview Chromium desktop/mobile, independent corruptions fail closed, signed generation and epoch races denied, XSS escaped, no external requests');
  return evidence;
 }finally{if(server)await new Promise(r=>server.close(r));await platform.dispose()}
}
