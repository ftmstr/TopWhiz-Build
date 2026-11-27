/** Both signed models in one real local D1, one loopback HTTP response. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {candidateDigest} from '../src/lineage.mjs';
import {canonicalBytes} from '../src/canonical.mjs';
import {b64url,grantMessage,editorMessage} from '../src/revision-proofs.mjs';
import {stageCandidates,claimStage} from '../src/staging.mjs';
import {slotWindow} from '../src/hourly.mjs';
import {appendReviewedRevision} from '../src/revision-ledger.mjs';
import {createNewsProjectionFixture} from '../ci/news-projection-d1.mjs';
import {projectLocalNews} from '../src/news-projection.mjs';
import {startUnifiedPreview} from '../src/local-unified-view.mjs';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const at='2026-11-23T00:00:00Z',hash='a'.repeat(64);
const makeDoc=async c=>({schemaVersion:'1.0',id:c.id,kind:c.kind,status:'APPROVED',title:{tr:'Sentetik teknik duyuru',en:'Synthetic technical announcement'},summary:{tr:'Bu yalnızca yerel çalıştırma için hazırlanmış sentetik bir kayıttır.',en:'This record exists only for synthetic local acceptance testing.'},body:{tr:'Tamamen kurgusal bir metindir; gerçek bir marka, ürün, olay veya haber iddiası içermez.',en:'This entirely synthetic sample does not make any real product, manufacturer or news claim.'},sources:[{...c.source,checkedAt:at,claimHash:hash},{url:'https://independent.example.net/lab',publisher:'Synthetic laboratory',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:hash}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:hash},media:[],publishedAt:at,sourceDigest:await candidateDigest(c),...(c.kind==='device'?{device:{...c.device,specifications:{screen:{value:'6.3',unit:'inch',sourceHash:hash}}}}:{})});
import {performance} from 'node:perf_hooks';
import {createInterface} from 'node:readline';
import {verifyDemo} from './unified-demo-integrity.mjs';
if(process.argv.length!==2)throw Error('DEMO_NO_OPTIONS');
verifyDemo();
process.env.WRANGLER_SEND_METRICS='false';
process.env.DO_NOT_TRACK='1';
const {getPlatformProxy}=await import(pathToFileURL(require.resolve('wrangler')).href);
const platform=await getPlatformProxy({configPath:fileURLToPath(new URL('../wrangler.ci-d1.jsonc',import.meta.url)),persist:false,remoteBindings:false});
let server,reader,closing;
const close=()=>closing??=Promise.resolve().then(async()=>{reader?.close();try{if(server){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}}finally{await platform.dispose()}console.log('TOPWHIZ_STOPPED')});
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

  // Fixture time is synthetic but advances with monotonic elapsed time; no perpetual grant.
  const origin=performance.now(),demoNow=()=>now+Math.floor(performance.now()-origin);
  const started=await startUnifiedPreview(combined,0,demoNow);server=started.server;
  assert.equal(server.address().address,'127.0.0.1');
  const response=await fetch(started.url);
  assert.equal(response.status,200);
  const html=await response.text();assert.ok(html.includes('id="projection-data"')&&html.includes('id="phone-projection-data"'));
  reader=createInterface({input:process.stdin,terminal:false});
  reader.on('line',line=>{if(line.trim().toLowerCase()==='stop')void close().catch(e=>{console.error(e);process.exitCode=1})});
  reader.once('close',()=>void close().catch(e=>{console.error(e);process.exitCode=1}));
  for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>void close().catch(e=>{console.error(e);process.exitCode=1}));
  console.log('HARD NO-GO; SYNTHETIC LOCAL ONLY; no real price or DP score');
  console.log('TOPWHIZ_READY '+started.url);
  console.log('Open URL in browser. Type stop and Enter to close.');
}catch(e){await close();throw e}
