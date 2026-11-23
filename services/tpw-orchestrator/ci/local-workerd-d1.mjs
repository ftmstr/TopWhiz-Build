/** CI-only: real local Cloudflare workerd D1, Cron and Workflow. NEVER deploy; no external source. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {preflightCandidate} from '../src/policy.mjs';
import {prefilterFeed} from '../src/adapters.mjs';
import {stageCandidates,readStage,claimStage,assertStageLease,finishStage,cleanupStage} from '../src/staging.mjs';
import {executeAgent} from '../src/runner.mjs';
import {candidateDigest} from '../src/lineage.mjs';
if(process.env.CI!=='true')throw new Error('CI_ONLY_TEST');
const root=fileURLToPath(new URL('../../../',import.meta.url));
const schema=fileURLToPath(new URL('../migrations/0001_tpw_stage.sql',import.meta.url));
const d1config=fileURLToPath(new URL('../wrangler.ci-d1.jsonc',import.meta.url));
const localconfig=fileURLToPath(new URL('../wrangler.ci-local.jsonc',import.meta.url));
const webRequire=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const {getPlatformProxy}=await import(pathToFileURL(webRequire.resolve('wrangler')).href);
const at='2026-11-23T00:00:00Z',time=Date.parse(at),hash='a'.repeat(64);
const source={url:'https://official.example.org/synthetic',publisher:'Synthetic manufacturer',rights:'LINK_ONLY',type:'PRIMARY'};
const news={id:'news_workerd_ci_001',kind:'news',source,observedAt:at,title:'Synthetic news for the local workerd D1 test'};
const device={id:'device_workerd_ci_001',kind:'device',source,observedAt:at,title:'Synthetic device for the local workerd D1 test',device:{brand:'Example',model:'Example P',sku:'EX-001',region:'TR'}};
const makeDoc=async c=>({schemaVersion:'1.0',id:c.id,kind:c.kind,status:'APPROVED',title:{tr:'Sentetik teknik duyuru',en:'Synthetic technical announcement'},summary:{tr:'Bu yalnızca yerel çalıştırma için hazırlanmış sentetik bir kayıttır.',en:'This record exists only for synthetic local acceptance testing.'},body:{tr:'Tamamen kurgusal bir metindir; gerçek bir marka, ürün, olay veya haber iddiası içermez.',en:'This entirely synthetic sample does not make any real product, manufacturer or news claim.'},sources:[{...c.source,checkedAt:at,claimHash:hash},{url:'https://independent.example.net/lab',publisher:'Synthetic laboratory',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:hash}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:hash},media:[],publishedAt:at,sourceDigest:await candidateDigest(c),...(c.kind==='device'?{device:{...c.device,specifications:{screen:{value:'6.3',unit:'inch',sourceHash:hash}}}}:{})});
const platform=await getPlatformProxy({configPath:d1config,persist:false,remoteBindings:false});
try {
 const db=platform.env.TPW_DB;assert.ok(db&&db.prepare&&db.exec,'Real local workerd D1 binding missing');
 // D1's exec() treats the leading comment / combined migration as an incomplete SQL statement.
 // Keep the source migration unchanged; prepare each fixed DDL statement independently.
 const ddl=readFileSync(schema,'utf8').replace(/^--[^\n]*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
 assert.equal(ddl.length,2,'EXPECTED_TWO_D1_MIGRATION_STATEMENTS');
 for(const statement of ddl)await db.prepare(statement).run();
 const reject={...news,body:'unlicensed body text'};
 const selection=prefilterFeed({items:[news,news,reject]},'news');
 assert.deepEqual(selection.stats,{received:3,rejected:1,duplicates:1});
 assert.equal(await stageCandidates(db,selection.approved,time),1);
 assert.equal(await stageCandidates(db,selection.approved,time),0);
 assert.equal((await readStage(db,time+1)).length,1);
 const claimed=await claimStage(db,news.id,'11111111-1111-4111-8111-111111111111',time+1);
 assert.equal(claimed?.id,news.id);
 await finishStage(db,news.id,'QUARANTINED',claimed.leaseToken,time+2);
 const row=await db.prepare('SELECT metadata_json,source_url,state FROM tpw_stage WHERE candidate_id=?').bind(news.id).first();
 assert.deepEqual([row.metadata_json,row.source_url,row.state],['{}','','QUARANTINED']);
 await cleanupStage(db,time+3*3600_000);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_stage').first()).n,0);
 const env={TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED',TPW_DB:db,TPW1_FEED_URL:'https://feeds.example.org/ci-news',TPW1_FEED_HOST:'feeds.example.org',TPW3_FEED_URL:'https://feeds.example.org/ci-device',TPW3_FEED_HOST:'feeds.example.org',TPW_EDITOR_API_URL:'https://editor.example.org/ci-validate',TPW_EDITOR_ALLOWED_HOST:'editor.example.org',TPW_EDITOR_API_TOKEN:'ci-synthetic-only'};
 const called=[];
 const mock=async(url,init)=>{called.push(url);const c=url===env.TPW1_FEED_URL?{items:[news]}:url===env.TPW3_FEED_URL?{items:[device]}:url===env.TPW_EDITOR_API_URL?await makeDoc(JSON.parse(init.body).candidate):null;if(!c)throw Error('UNAUTHORIZED_NETWORK');return new Response(JSON.stringify(c),{headers:{'Content-Type':'application/json'}})};
 assert.equal((await executeAgent({agent:'TPW1',env,fetcher:mock,clock:time,nowFn:()=>time+1})).accepted,1);
 assert.equal((await executeAgent({agent:'TPW3',env,fetcher:mock,clock:time,nowFn:()=>time+1})).accepted,1);
 const r=await executeAgent({agent:'TPW2',env,fetcher:mock,clock:time,nowFn:()=>time+2});
 assert.equal(r.approved,2);assert.equal(r.githubWrites,0);assert.equal(r.quarantined,0);
 assert.equal(called.length,4);assert.ok(called.every(x=>!x.includes('github.com')));
 assert.equal((await db.prepare("SELECT count(*) AS n FROM tpw_stage WHERE state='APPROVED'").first()).n,2);
 await cleanupStage(db,time+1);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_stage').first()).n,2,'scrubbed terminal IDs must persist as anti-replay tombstones');
 assert.equal(await stageCandidates(db,[news,device],time+1),0,'terminal IDs cannot be immediately re-staged');
 await cleanupStage(db,time+3*3600_000);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_stage').first()).n,0);
 // Two independent TPW2 runs read the same PENDING row, but only one D1 CAS claim may proceed.
 const leaseStart=time+3*3600_000+1000;
 assert.equal(await stageCandidates(db,[news],leaseStart),1);
 const both=await Promise.all([
  claimStage(db,news.id,'22222222-2222-4222-8222-222222222222',leaseStart+1000),
  claimStage(db,news.id,'33333333-3333-4333-8333-333333333333',leaseStart+1000)
 ]);
 assert.equal(both.filter(Boolean).length,1,'concurrent lease CAS must have one winner');
 const winner=both.find(Boolean),loser=both.find(x=>!x);
 assert.equal(loser,null);
 await assertStageLease(db,news.id,winner.leaseToken,leaseStart+1000);
 await assert.rejects(assertStageLease(db,news.id,'44444444-4444-4444-8444-444444444444',leaseStart+1000),/LEASE_LOST/);
 await assert.rejects(finishStage(db,news.id,'APPROVED','44444444-4444-4444-8444-444444444444',leaseStart+1000),/LEASE_LOST/);
 await cleanupStage(db,leaseStart+6*60_000);
 const expired=await db.prepare('SELECT state,metadata_json,source_url FROM tpw_stage WHERE candidate_id=?').bind(news.id).first();
 assert.deepEqual([expired.state,expired.metadata_json,expired.source_url],['QUARANTINED','{}','']);
 assert.equal(await stageCandidates(db,[news],leaseStart+6*60_000),0,'expired claim cannot silently requeue or write GitHub');
 console.log('PASS D1 concurrent claim CAS, wrong-token denial, expired lease -> scrubbed quarantine, anti-replay tombstone');
 console.log('PASS workerd local D1; TPW1+TPW3 staging, TPW2 TR/EN gates, rejected metadata never staged/GitHub, payload TTL cleanup');
}finally{await platform.dispose()}

const tmp=mkdtempSync(join(tmpdir(),'topwhiz-workerd-'));
const port=18895,args=(...a)=>['--filter','@topwhiz/web','exec','wrangler',...a],ciEnv={...process.env,WRANGLER_SEND_METRICS:'false'};
let worker,log='';
function wranglerSync(a){
 const r=spawnSync('pnpm',args(...a),{cwd:root,env:ciEnv,encoding:'utf8',timeout:45000});
 if(r.status!==0)throw Error('LOCAL_WRANGLER_FAILED '+a.join(' ')+'\n'+(r.stdout||'').slice(-1000)+'\n'+(r.stderr||'').slice(-1000));
 return (r.stdout||'')+'\n'+(r.stderr||'');
}
try{
 wranglerSync(['d1','execute','topwhiz-tpw-synthetic-ci','--config',localconfig,'--local','--persist-to',tmp,'--file',schema]);
 worker=spawn('pnpm',args('dev','--config',localconfig,'--local','--test-scheduled','--ip','127.0.0.1','--port',String(port),'--persist-to',tmp),{cwd:root,env:ciEnv,stdio:['ignore','pipe','pipe']});
 for(const stream of [worker.stdout,worker.stderr])stream.on('data',data=>{log=(log+String(data)).slice(-12000)});
 let ready=false;
 for(let i=0;i<100;i++){if(worker.exitCode!==null)break;try{const response=await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(500)});if(response.status===404){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}
 if(!ready)throw Error('LOCAL_WORKERD_NOT_READY '+log.slice(-4000));
 for(const [minute,agent] of [[0,'tpw1'],[20,'tpw3'],[40,'tpw2']]){
  const query='?cron='+encodeURIComponent(minute+' * * * *')+'&time='+Date.UTC(2026,10,23,0,minute)+'&format=json';
  let response=await fetch('http://127.0.0.1:'+port+'/cdn-cgi/local/scheduled'+query,{signal:AbortSignal.timeout(12000)});
  if(response.status===404)response=await fetch('http://127.0.0.1:'+port+'/cdn-cgi/handler/scheduled'+query,{signal:AbortSignal.timeout(12000)});
  const body=await response.text();if(!response.ok||!body.includes('ok'))throw Error('LOCAL_CRON_FAILED '+agent+' '+response.status+' '+body+' '+log.slice(-1500));
  const instance='tpw-'+agent+'-2026112300';let confirmed=false;
  for(let check=0;check<12;check++){
   const r=spawnSync('pnpm',args('workflows','instances','describe','topwhiz-tpw-agent-ci',instance,'--local','--port',String(port)),{cwd:root,env:ciEnv,encoding:'utf8',timeout:15000});
   const result=(r.stdout||'')+'\n'+(r.stderr||'');
   if(r.status===0&&/complete|success|succeed/i.test(result)){confirmed=true;break}
   await new Promise(r=>setTimeout(r,700));
  }
  if(!confirmed)throw Error('LOCAL_WORKFLOW_NOT_VERIFIED '+instance+' '+log.slice(-3000));
 }
 console.log('PASS 3 genuine local scheduled events + Workflows instances (sources intentionally unconfigured)');
}finally{
 if(worker&&!worker.killed)worker.kill('SIGTERM');
 rmSync(tmp,{recursive:true,force:true});
}
