/** Real local D1 signed device revision -> isolated loopback -> Chromium. */
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
import {startLocalDevicePreview,loadLocalDeviceView} from '../src/local-device-view.mjs';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const at='2026-11-23T00:00:00Z',hash='a'.repeat(64);
const makeDoc=async c=>({schemaVersion:'1.0',id:c.id,kind:c.kind,status:'APPROVED',title:{tr:'Sentetik teknik duyuru',en:'Synthetic technical announcement'},summary:{tr:'Bu yalnızca yerel çalıştırma için hazırlanmış sentetik bir kayıttır.',en:'This record exists only for synthetic local acceptance testing.'},body:{tr:'Tamamen kurgusal bir metindir; gerçek bir marka, ürün, olay veya haber iddiası içermez.',en:'This entirely synthetic sample does not make any real product, manufacturer or news claim.'},sources:[{...c.source,checkedAt:at,claimHash:hash},{url:'https://independent.example.net/lab',publisher:'Synthetic laboratory',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:hash}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:hash},media:[],publishedAt:at,sourceDigest:await candidateDigest(c),...(c.kind==='device'?{device:{...c.device,specifications:{screen:{value:'6.3',unit:'inch',sourceHash:hash}}}}:{})});
export async function testDevicePreview(browser,out){
 const {getPlatformProxy}=await import(pathToFileURL(require.resolve('wrangler')).href);
 const platform=await getPlatformProxy({configPath:fileURLToPath(new URL('../wrangler.ci-d1.jsonc',import.meta.url)),persist:false,remoteBindings:false});
 let server;
 try{
  const db=platform.env.TPW_DB;
  for(const name of ['0001_tpw_stage.sql','0002_tpw_hourly.sql','0003_tpw_revisions.sql','0004_tpw_revision_proofs.sql','0005_tpw_revision_authority.sql','0008_tpw_device_evidence.sql'])for(const stmt of readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').replace(/^--[^\n]*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(stmt).run();
  const keys=await Promise.all([0,1,2].map(()=>crypto.subtle.generateKey('Ed25519',true,['sign','verify'])));
  const pins=await Promise.all(keys.map(k=>crypto.subtle.exportKey('raw',k.publicKey).then(b64url)));
  const env={TPW_DB:db,TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED',TPW_EDITOR_PUBLIC_KEY:pins[0],TPW_LICENSE_PUBLIC_KEY:pins[1],TPW_REVOCATION_PUBLIC_KEY:pins[2]};
  const sign=async(k,msg)=>b64url(await crypto.subtle.sign('Ed25519',k.privateKey,canonicalBytes(msg)));
  const slot='2026112307',clock=slotWindow('TPW2',slot).start+1,expiry=clock+3600000,scope={slot,owner:'synthetic-device-preview',guard:async()=>{}};
  let now=clock+1;
  const started=await startLocalDevicePreview(env,0,()=>now);server=started.server;const url=started.url;
  assert.equal((await fetch(url)).status,503);
  await db.prepare("INSERT INTO tpw_hourly_run(slot,agent,state,owner,started_at,deadline) VALUES (?,'TPW2','RUNNING',?,?,?)").bind(slot,scope.owner,clock,slotWindow('TPW2',slot).end).run();
  const source={url:'https://official.example.org/synthetic',publisher:'Synthetic manufacturer',rights:'LINK_ONLY',type:'PRIMARY'};
  const append=async(id,region,screen,expectedHead)=>{
   const c={id:'device_preview_'+id,kind:'device',source,observedAt:at,title:'Synthetic device preview',device:{brand:'Example',model:'Demo P',sku:'EX-001',region}};
   await stageCandidates(db,[c],clock,scope);
   const owned=await claimStage(db,c.id,crypto.randomUUID(),clock,slot);
   const article=await makeDoc(c);article.device.specifications.screen.value=screen;
   const grants=await Promise.all(article.sources.map(async s=>({expiresAt:expiry,signature:await sign(keys[1],grantMessage(s,expiry))})));
   const proof={epoch:0,grants,editorSignature:await sign(keys[0],editorMessage(article,expectedHead,slot,grants,0))};
   const result=await appendReviewedRevision({env,owned,article,expectedHead,scope,proof,nowFn:()=>now});
   return {result,article,proof};
  };
  const first=await append('old','TR','6.1',null);
  const current=await append('new','TR','6.7',first.result.revisionHash);
  await append('other','US','6.5',null);
  const view=await loadLocalDeviceView(env,()=>now);assert.equal(view.phones.length,2);assert.ok(view.phones.every(p=>p.spec[1]===null));assert.ok(!view.phones.some(p=>p.spec[0]==='6.1 inch'));
  const evidence=[];
  for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]]){
   const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'}),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{if(![url,url+'site.js',url+'site.css',url+'favicon.ico'].includes(route.request().url())){external.push(route.request().url());return route.abort()}return route.continue()});
   try{
    assert.equal((await page.goto(url)).status(),200);
    assert.equal(await page.locator('#devices article').count(),2);
    const table=await page.locator('#comparison').innerText();assert.match(table,/EX-001 \/ TR/);assert.match(table,/EX-001 \/ US/);assert.match(table,/6\.7 inch/);assert.match(table,/Bilinmiyor/);assert.doesNotMatch(table,/6\.1 inch/);
    await page.locator('#en').click();assert.match(await page.locator('#comparison').innerText(),/Unknown/);assert.match(await page.locator('#dragon').innerText(),/Scores unavailable/);
    await page.locator('#diff').check();assert.equal(await page.locator('#comparison tbody tr').count(),1);
    await page.locator('#diff').uncheck();
    const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.viewport+1);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await page.locator('#tr').click();await page.locator('#phones').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'devices-'+name+'.png'),fullPage:true});
    evidence.push({name,width,height,devices:2,unknownPreserved:true,externalRequests:0,pageErrors:0,layout});
   }finally{await page.close()}
  }
  const revision=current.result.revisionHash;
  const saved=await db.prepare('SELECT * FROM tpw_device_evidence WHERE revision_hash=?').bind(revision).first();
  await db.prepare('DELETE FROM tpw_device_evidence WHERE revision_hash=?').bind(revision).run();
  assert.equal((await fetch(url)).status,503);
  await db.prepare('INSERT INTO tpw_device_evidence(revision_hash,article_json,proof_json) VALUES(?,?,?)').bind(revision,saved.article_json,saved.proof_json).run();
  now=expiry;assert.equal((await fetch(url)).status,503);now=clock+1;
  const token=await candidateDigest(grantMessage(current.article.sources[0],expiry));
  await applyRevocation({env,token,epoch:0,signature:await sign(keys[2],revokeMessage(token,0)),nowFn:()=>now});
  assert.equal((await fetch(url)).status,503);
  console.log('PASS local D1 signed device evidence to Chromium desktop/mobile, SKU region current revision, unknown values, missing expired revoked proof denial');
  return evidence;
 }finally{if(server)await new Promise(r=>server.close(r));await platform.dispose()}
}
