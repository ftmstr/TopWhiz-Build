/** Both signed models in one real local D1, one loopback HTTP response. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
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
import {readTpwNextDto} from '../src/next-read-dto.mjs';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const at='2026-11-23T00:00:00Z',hash='a'.repeat(64);
const makeDoc=async c=>({schemaVersion:'1.0',id:c.id,kind:c.kind,status:'APPROVED',title:{tr:'Sentetik teknik duyuru',en:'Synthetic technical announcement'},summary:{tr:'Bu yalnızca yerel çalıştırma için hazırlanmış sentetik bir kayıttır.',en:'This record exists only for synthetic local acceptance testing.'},body:{tr:'Tamamen kurgusal bir metindir; gerçek bir marka, ürün, olay veya haber iddiası içermez.',en:'This entirely synthetic sample does not make any real product, manufacturer or news claim.'},sources:[{...c.source,checkedAt:at,claimHash:hash},{url:'https://independent.example.net/lab',publisher:'Synthetic laboratory',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:hash}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:hash},media:[],publishedAt:at,sourceDigest:await candidateDigest(c),...(c.kind==='device'?{device:{...c.device,specifications:{screen:{value:'6.3',unit:'inch',sourceHash:hash}}}}:{})});
async function signedFixture(token){
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

  const n1=await fixture.signed(1,null,'a',301),r1=await projectLocalNews(n1);
  const n2=await fixture.signed(2,r1.operationId,'b',302),r2=await projectLocalNews(n2);
  let reads=0;
  const send=(res,status,bytes=Buffer.alloc(0))=>{res.writeHead(status,{'Cache-Control':'private, no-store, max-age=0','Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,'X-Content-Type-Options':'nosniff'});res.end(bytes)};
  server=http.createServer(async(req,res)=>{
   const got=Buffer.from(req.headers.authorization||''),want=Buffer.from('Bearer '+token);
   if(req.headers.host!=='127.0.0.1:3135'||req.method!=='GET'||req.url!=='/read'||got.length!==want.length||!timingSafeEqual(got,want)){send(res,403);return}
   try{reads++;const dto=await readTpwNextDto(combined,()=>now);send(res,200,Buffer.from(JSON.stringify(dto)))}catch{send(res,503)}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3135,'127.0.0.1',resolve)});
  const row=await db.prepare('SELECT path,document_json FROM tpw_news_projection_rows WHERE operation_id=? ORDER BY path LIMIT 1').bind(r2.operationId).first();
  const rev=current.result.revisionHash,saved=await db.prepare('SELECT article_json FROM tpw_device_evidence WHERE revision_hash=?').bind(rev).first();
  const originalNow=now;
  return {
   reads:()=>reads,
   corruptNews:async bad=>db.prepare('UPDATE tpw_news_projection_rows SET document_json=? WHERE operation_id=? AND path=?').bind(bad?'{}':row.document_json,r2.operationId,row.path).run(),
   corruptDevice:async bad=>db.prepare('UPDATE tpw_device_evidence SET article_json=? WHERE revision_hash=?').bind(bad?'{}':saved.article_json,rev).run(),
   expire:bad=>{now=bad?expiry:originalNow},
   advance:async()=>projectLocalNews(await fixture.signed(3,r2.operationId,'c',303)),
   revoke:async()=>{const t=await candidateDigest(grantMessage(current.article.sources[0],expiry));await applyRevocation({env,token:t,epoch:0,signature:await sign(keys[2],revokeMessage(t,0)),nowFn:()=>now})},
   close:async()=>{try{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}finally{await platform.dispose()}}
  };
 }catch(e){try{if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r))}}finally{await platform.dispose()}throw e}
}
const root=fileURLToPath(new URL('../../../',import.meta.url)),route=join(root,'apps/web/app/tpw-ci-signed'),leaf=join(route,'[locale]'),out=process.argv[2];
assert.ok(out&&process.platform==='linux');
const sha=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();assert.equal(sha,process.env.TOPWHIZ_EXPECTED_HEAD);
assert.equal(existsSync(route),false);const token=randomBytes(32).toString('hex');
const source=readFileSync(join(root,'apps/web/ci/tpw-signed-route.ts'),'utf8');assert.equal(source.split('__TPW_CI_SECRET__').length,2);
const {chromium}=require('@playwright/test');
const run=async args=>{const c=spawn('pnpm',args,{cwd:root,stdio:'inherit',env:process.env});await new Promise((resolve,reject)=>{c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(Error('BUILD_EXIT '+code)))})};
async function launch(args){const c=spawn('pnpm',args,{cwd:root,detached:true,stdio:'inherit',env:process.env});const done=new Promise((resolve,reject)=>{c.once('error',reject);c.once('exit',(code,signal)=>resolve({code,signal}))});return {c,done}}
async function stop(p,base){try{process.kill(-p.c.pid,'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}if(await Promise.race([p.done.then(()=>true),sleep(5000).then(()=>false)])===false){try{process.kill(-p.c.pid,'SIGKILL')}catch(e){if(e.code!=='ESRCH')throw e}await p.done}
 await assert.rejects(fetch(base+'/tpw-ci-signed/tr',{signal:AbortSignal.timeout(3000)}));}
async function testRuntime(runtime,fixture,base,dir){
 const path=base+'/tpw-ci-signed/tr';mkdirSync(dir,{recursive:true});
 const authless=await fetch('http://127.0.0.1:3135/read');assert.equal(authless.status,403);assert.equal((await authless.arrayBuffer()).byteLength,0);
 let ready;
 for(let i=0;i<100;i++){try{ready=await fetch(path,{signal:AbortSignal.timeout(2000)});if(ready.status===200)break}catch{}await sleep(500)}
 assert.equal(ready?.status,200,'SIGNED_RUNTIME_NOT_READY '+runtime);
 const checked=async(url=path,status=200,headers={})=>{
  const res=await fetch(url,{headers,cache:'no-store'});assert.equal(res.status,status);
  assert.match(res.headers.get('cache-control')||'',/no-store/);assert.match(res.headers.get('x-robots-tag')||'',/noindex/);
  const csp=res.headers.get('content-security-policy')||'';assert.match(csp,/script-src 'none'/);assert.match(csp,/connect-src 'none'/);
  const body=await res.text();if(status!==200)assert.equal(body,'');else assert.ok(!body.includes(token)&&!body.includes('TPW_EDITOR_PUBLIC_KEY')&&!body.includes('proof_json'));
  return body;
 };
 const before=fixture.reads();assert.match(await checked(),/data-generation="2"/);assert.match(await checked(path,200,{'if-none-match':'"old"','authorization':'Bearer client-controlled'}),/data-generation="2"/);assert.equal(fixture.reads()-before,2);
 await checked(base+'/tpw-ci-signed/zz',404);await checked(path+'?generation=1',400);
 const browser=await chromium.launch(),evidence=[];
 try{
  for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]])for(const lang of ['tr','en']){
   const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'}),external=[],errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('dialog');void d.dismiss()});
   await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||!['/tpw-ci-signed/tr','/tpw-ci-signed/en','/tpw-ci-signed/css'].includes(u.pathname)){external.push(u.href);return r.abort()}return r.continue()});
   try{
    const res=await page.goto(base+'/tpw-ci-signed/'+lang);assert.equal(res.status(),200);assert.equal(await page.locator('html').getAttribute('lang'),lang);
    assert.equal(await page.locator('[data-generation]').getAttribute('data-generation'),'2');assert.equal(await page.locator('#news article').count(),2);assert.equal(await page.locator('#phones article').count(),2);
    assert.ok((await page.locator('#news h3').allTextContents()).every(x=>x.includes('CURRENT')));
    assert.match(await page.locator('#compare').innerText(),/6\.7 inch/);assert.match(await page.locator('#compare').innerText(),/6\.5 inch/);assert.doesNotMatch(await page.locator('#compare').innerText(),/6\.1 inch/);
    assert.match(await page.locator('#compare').innerText(),lang==='tr'?/Bilinmiyor/:/Unknown/);assert.equal(await page.locator('[data-dp-state=DISABLED]').count(),1);
    assert.equal(await page.locator('[data-category-filtering=false]').count(),1);assert.equal(await page.locator('#phones meter').count(),2);
    assert.equal(await page.locator('script,img,iframe,video,object,embed,form').count(),0);
    if(lang==='tr'){await page.locator('#news summary').first().click();assert.match(await page.locator('#news details p').first().innerText(),/<\/template><img/);await page.locator('#news summary').first().click()}
    const backgrounds=new Set();
    for(const theme of ['dark','light']){
     if(theme==='light')await page.locator('#theme').check();
     const bg=await page.locator('.tpw37').evaluate(el=>getComputedStyle(el).backgroundColor);backgrounds.add(bg);
     const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.viewport+1);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
     await page.evaluate(()=>scrollTo(0,0));const file=name+'-'+lang+'-'+theme+'.png';await page.screenshot({path:join(dir,file),fullPage:true,animations:'disabled'});const bytes=readFileSync(join(dir,file));
     evidence.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),lang,theme,width,height,layout,externalRequests:0,pageErrors:0});
    }
    assert.equal(backgrounds.size,2);
   }finally{await page.close()}
  }
  // Separate browser probe: actual CSP enforcement, not just the header.
  const probe=await browser.newPage();try{
   await probe.goto(path);
   const result=await probe.evaluate(async()=>{
    const violations=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.effectiveDirective));
    const script=document.createElement('script');script.textContent='window.tpwCspExecuted=true';document.body.append(script);
    let blocked=false;try{await fetch('http://127.0.0.1:3135/read')}catch{blocked=true}
    await new Promise(r=>setTimeout(r,250));return {executed:Reflect.get(window,'tpwCspExecuted')===true,blocked,violations};
   });
   assert.equal(result.executed,false);assert.equal(result.blocked,true);assert.ok(result.violations.some(x=>x.startsWith('script-src')));assert.ok(result.violations.includes('connect-src'));
  }finally{await probe.close()}
  await fixture.corruptNews(true);await checked(path,503,{'if-none-match':'"old"'});await fixture.corruptNews(false);await checked();
  await fixture.corruptDevice(true);await checked(path,503);await fixture.corruptDevice(false);await checked();
  fixture.expire(true);await checked(path,503);fixture.expire(false);await checked();
  await fixture.advance();assert.match(await checked(),/data-generation="3"/);
  await fixture.revoke();await checked(path,503,{'if-none-match':'"old"'});await checked(base+'/tpw-ci-signed/en',503);
  assert.equal(evidence.length,8);writeFileSync(join(dir,'evidence.json'),JSON.stringify({head:sha,runtime,chromium:browser.version(),signedD1Integration:'REQUEST_TIME_LOCAL_CI_BRIDGE',cspEnforcement:'BROWSER_INLINE_SCRIPT_AND_CONNECT_DENIED',noStore:true,invalidEmpty503:true,generationAdvance:true,epochRevocation:true,expiredProof:true,receiverLastByte:'NOT_VERIFIED',evidence},null,2)+'\n');
  console.log('PASS TUR37 '+runtime+' request-time signed D1 HTTP, generation, corruption, expiry, signed epoch, empty 503, no-store, browser CSP, 8 PNG');
 }finally{await browser.close()}
}
mkdirSync(route);try{
 mkdirSync(leaf);writeFileSync(join(leaf,'route.ts'),source.replace('__TPW_CI_SECRET__',token),{flag:'wx'});
 for(const runtime of ['next','workerd']){
  if(runtime==='workerd'){const gate=spawnSync('node',['scripts/tur011-workerd-config-gate.mjs'],{cwd:root,stdio:'inherit'});assert.equal(gate.status,0)}
  await run(['--filter','@topwhiz/web',runtime==='next'?'build':'build:workerd']);
  const base='http://127.0.0.1:'+(runtime==='next'?3134:3116),fixture=await signedFixture(token);let proc;
  try{proc=await launch(runtime==='next'?['--filter','@topwhiz/web','exec','next','start','-H','127.0.0.1','-p','3134']:['--filter','@topwhiz/web','preview:workerd']);await testRuntime(runtime,fixture,base,join(out,runtime))}
  finally{try{if(proc)await stop(proc,base)}finally{await fixture.close();await assert.rejects(fetch('http://127.0.0.1:3135/read',{signal:AbortSignal.timeout(3000)}))}}
  console.log('PASS TUR37 '+runtime+' runtime and private bridge ports closed');
 }
}finally{rmSync(route,{recursive:true,force:true})}
assert.equal(existsSync(route),false);
