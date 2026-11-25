/** Standalone synthetic local demonstration; never reads real credentials or calls external feeds. */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {executeHourly,slotWindow} from '../src/hourly.mjs';
import {candidateDigest} from '../src/lineage.mjs';
import {canonicalBytes} from '../src/canonical.mjs';
import {b64url,grantMessage,editorMessage} from '../src/revision-proofs.mjs';
import {inspectSetup,loadClosedConfigs} from './pilot-preflight.mjs';
import {readLocalMetrics} from './pilot-panel.mjs';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--out')throw Error('USAGE: --out NEW_DIRECTORY');
const out=resolve(args[1]);
assert.equal(inspectSetup(loadClosedConfigs(),{}).closedConfig,true);
mkdirSync(out,{recursive:false,mode:0o700});
const state=join(out,'state');mkdirSync(state,{mode:0o700});
process.env.WRANGLER_SEND_METRICS='false';
const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const {getPlatformProxy}=await import(pathToFileURL(require.resolve('wrangler')).href);
const configPath=fileURLToPath(new URL('../wrangler.ci-d1.jsonc',import.meta.url));
const manifest=JSON.parse(readFileSync(new URL('../pilot/manifest.json',import.meta.url),'utf8'));
const at='2026-11-23T00:00:00Z',time=Date.parse(at),hash='a'.repeat(64);
const source={url:'https://official.example.org/synthetic',publisher:'Synthetic manufacturer',rights:'LINK_ONLY',type:'PRIMARY'};
const news={id:'news_workerd_ci_001',kind:'news',source,observedAt:at,title:'Synthetic news for the local workerd D1 test'};
const device={id:'device_workerd_ci_001',kind:'device',source,observedAt:at,title:'Synthetic device for the local workerd D1 test',device:{brand:'Example',model:'Example P',sku:'EX-001',region:'TR'}};
const makeDoc=async c=>({schemaVersion:'1.0',id:c.id,kind:c.kind,status:'APPROVED',title:{tr:'Sentetik teknik duyuru',en:'Synthetic technical announcement'},summary:{tr:'Bu yalnızca yerel çalıştırma için hazırlanmış sentetik bir kayıttır.',en:'This record exists only for synthetic local acceptance testing.'},body:{tr:'Tamamen kurgusal bir metindir; gerçek bir marka, ürün, olay veya haber iddiası içermez.',en:'This entirely synthetic sample does not make any real product, manufacturer or news claim.'},sources:[{...c.source,checkedAt:at,claimHash:hash},{url:'https://independent.example.net/lab',publisher:'Synthetic laboratory',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:hash}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:hash},media:[],publishedAt:at,sourceDigest:await candidateDigest(c),...(c.kind==='device'?{device:{...c.device,specifications:{screen:{value:'6.3',unit:'inch',sourceHash:hash}}}}:{})});
const editorKeys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const licenseKeys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const adminKeys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const sign=async(key,msg)=>b64url(await crypto.subtle.sign('Ed25519',key,canonicalBytes(msg)));
const makeProof=async(article,previous,slot,epoch=0,expiresAt=time+24*3600_000)=>{
 const grants=await Promise.all(article.sources.map(async s=>({expiresAt,signature:await sign(licenseKeys.privateKey,grantMessage(s,expiresAt))})));
 return {epoch,grants,editorSignature:await sign(editorKeys.privateKey,editorMessage(article,previous,slot,grants,epoch))};
};

const platform=await getPlatformProxy({configPath,persist:{path:state},remoteBindings:false});
let before;
try{
 const db=platform.env.TPW_DB;
 for(const name of manifest.migrations){
  assert.match(name,/^\d{4}_tpw_[a-z_]+\.sql$/);
  const sql=readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
  for(const statement of sql.replace(/^--[^\n]*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 }
 const env={TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED',TPW_DB:db,
 TPW1_FEED_URL:'https://official.example.org/news-feed',TPW1_FEED_HOST:'official.example.org',TPW1_SOURCE_FORMAT:'RSS',TPW1_SOURCE_HOST:'official.example.org',TPW1_SOURCE_PUBLISHER:source.publisher,
 TPW3_FEED_URL:'https://official.example.org/device-feed',TPW3_FEED_HOST:'official.example.org',TPW3_SOURCE_FORMAT:'DEVICE_API',TPW3_SOURCE_HOST:'official.example.org',TPW3_SOURCE_PUBLISHER:source.publisher,TPW3_SOURCE_BRAND:device.device.brand,
 TPW_EDITOR_API_URL:'https://editor.example.org/ci-validate',TPW_EDITOR_ALLOWED_HOST:'editor.example.org',TPW_EDITOR_API_TOKEN:'SYNTHETIC_DEMO_TOKEN_DO_NOT_DISPLAY'};
 env.TPW_EDITOR_PUBLIC_KEY=b64url(await crypto.subtle.exportKey('raw',editorKeys.publicKey));
 env.TPW_LICENSE_PUBLIC_KEY=b64url(await crypto.subtle.exportKey('raw',licenseKeys.publicKey));
 env.TPW_REVOCATION_PUBLIC_KEY=b64url(await crypto.subtle.exportKey('raw',adminKeys.publicKey));
 let calls=0;
 const mock=async(url,init)=>{
  calls++;
  if(url===env.TPW1_FEED_URL)return new Response('<rss version="2.0"><channel><item><title>Synthetic news for pilot demo</title><link>'+source.url+'</link></item></channel></rss>',{headers:{'Content-Type':'application/rss+xml'}});
  let data;
  if(url===env.TPW3_FEED_URL)data={items:[{title:device.title,url:source.url,device:device.device}]};
  else if(url===env.TPW_EDITOR_API_URL){
   const q=JSON.parse(init.body),article=await makeDoc(q.candidate);
   data=q.candidate.kind==='device'?{article,proof:await makeProof(article,q.previousRevision,q.slot,q.authorityEpoch)}:article;
  }else throw Error('DEMO_NETWORK_DENIED');
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 };
 const slot='2026112300';
 const run=agent=>executeHourly({agent,slot,env,fetcher:mock,nowFn:()=>slotWindow(agent,slot).start+1});
 const first=await run('TPW1'),third=await run('TPW3'),second=await run('TPW2');
 assert.equal(first.accepted,1);assert.equal(third.accepted,1);
 assert.equal(second.approved,2);assert.equal(second.quarantined,0);assert.equal(second.githubWrites,0);assert.equal(calls,4);
 before=await readLocalMetrics(db);
 assert.equal(before.status,'LOCAL_READ_OK');
 for(const agent of ['TPW1','TPW3','TPW2'])assert.equal(before.runs[agent].SUCCEEDED,1);
 assert.equal(before.stage.APPROVED,2);assert.equal(before.revisions,1);assert.equal(before.operations,1);assert.equal(before.epoch,0);
 const scrub=await db.prepare("SELECT count(*) AS n FROM tpw_stage WHERE metadata_json<>'{}' OR source_url<>''").first();assert.equal(scrub.n,0);
}finally{await platform.dispose()}
const inspector=fileURLToPath(new URL('./pilot-inspect.mjs',import.meta.url));
function inspect(html){
 const result=spawnSync(process.execPath,[inspector,...(html?['--html']:[]),'--local-state',state],{encoding:'utf8',timeout:60000,env:{...process.env,TPW_EDITOR_API_TOKEN:'SYNTHETIC_DEMO_TOKEN_DO_NOT_DISPLAY',WRANGLER_SEND_METRICS:'false'}});
 if(result.status!==0)throw Error('DEMO_CLI_READ_FAILED');
 assert.ok(!result.stdout.includes('SYNTHETIC_DEMO_TOKEN_DO_NOT_DISPLAY'));
 assert.ok(!result.stdout.includes(source.url));
 return result.stdout;
}
const report=JSON.parse(inspect(false));assert.deepEqual(report.metrics,before);
assert.equal(report.setup.release,'HARD_NO_GO');assert.equal(report.setup.pilot,'BLOCKED');
const html=inspect(true);assert.ok(html.includes('LOCAL_READ_OK')&&html.includes('HARD NO-GO'));
writeFileSync(join(out,'operations.json'),JSON.stringify(report,null,2)+'\n');
writeFileSync(join(out,'operations.html'),html);
writeFileSync(join(out,'README.txt'),'TOPWHIZ synthetic local demonstration only.\nOpen operations.html. No live data or release authorization.\noperations.json is the redacted snapshot. state/ is local synthetic D1, not for sharing.\n');
console.log('PASS synthetic official RSS + DEVICE_API + TPW2 TR/EN signed revision, zero GitHub writes');
console.log('PASS persistent D1 reopened by separate JSON and HTML CLI processes; identical aggregate metrics');
