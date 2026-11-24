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
import {executeHourly,slotWindow,pruneHourlyRuns,RUN_RETENTION_MS} from '../src/hourly.mjs';
import {appendReviewedRevision,deviceVariantKey,readRevisionHead} from '../src/revision-ledger.mjs';
import {canonicalBytes} from '../src/canonical.mjs';
import {applyRevocation,revokeMessage,readAuthorityEpoch} from '../src/revision-authority.mjs';
import {b64url,grantMessage,editorMessage} from '../src/revision-proofs.mjs';
import {candidateDigest} from '../src/lineage.mjs';
if(process.env.CI!=='true')throw new Error('CI_ONLY_TEST');
const root=fileURLToPath(new URL('../../../',import.meta.url));
const schema=fileURLToPath(new URL('../migrations/0001_tpw_stage.sql',import.meta.url));
const hourlySchema=fileURLToPath(new URL('../migrations/0002_tpw_hourly.sql',import.meta.url));
const revisionSchema=fileURLToPath(new URL('../migrations/0003_tpw_revisions.sql',import.meta.url));
const proofSchema=fileURLToPath(new URL('../migrations/0004_tpw_revision_proofs.sql',import.meta.url));
const authoritySchema=fileURLToPath(new URL('../migrations/0005_tpw_revision_authority.sql',import.meta.url));
const d1config=fileURLToPath(new URL('../wrangler.ci-d1.jsonc',import.meta.url));
const localconfig=fileURLToPath(new URL('../wrangler.ci-local.jsonc',import.meta.url));
const webRequire=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const {getPlatformProxy}=await import(pathToFileURL(webRequire.resolve('wrangler')).href);
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
const platform=await getPlatformProxy({configPath:d1config,persist:false,remoteBindings:false});
try {
 const db=platform.env.TPW_DB;assert.ok(db&&db.prepare&&db.exec,'Real local workerd D1 binding missing');
 // D1's exec() treats the leading comment / combined migration as an incomplete SQL statement.
 // Keep the source migration unchanged; prepare each fixed DDL statement independently.
 const ddl=readFileSync(schema,'utf8').replace(/^--[^\n]*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
 assert.equal(ddl.length,2,'EXPECTED_TWO_D1_MIGRATION_STATEMENTS');
 for(const statement of ddl)await db.prepare(statement).run();
 for(const statement of readFileSync(hourlySchema,'utf8').replace(/^--[^\n]*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
 for(const statement of readFileSync(revisionSchema,'utf8').replace(/^--[^\n]*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
 for(const statement of readFileSync(proofSchema,'utf8').replace(/^--[^\n]*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
 for(const statement of readFileSync(authoritySchema,'utf8').replace(/^--[^\n]*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
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
 env.TPW_EDITOR_PUBLIC_KEY=b64url(await crypto.subtle.exportKey('raw',editorKeys.publicKey));
 env.TPW_LICENSE_PUBLIC_KEY=b64url(await crypto.subtle.exportKey('raw',licenseKeys.publicKey));
 env.TPW_REVOCATION_PUBLIC_KEY=b64url(await crypto.subtle.exportKey('raw',adminKeys.publicKey));
 const called=[];
 const mock=async(url,init)=>{called.push(url);let c;
 if(url===env.TPW1_FEED_URL)c={items:[news]};
 else if(url===env.TPW3_FEED_URL)c={items:[device]};
 else if(url===env.TPW_EDITOR_API_URL){const q=JSON.parse(init.body),article=await makeDoc(q.candidate);c=q.candidate.kind==='device'?{article,proof:await makeProof(article,q.previousRevision,q.slot,q.authorityEpoch)}:article}
 else throw Error('UNAUTHORIZED_NETWORK');
 return new Response(JSON.stringify(c),{headers:{'Content-Type':'application/json'}})
 };
 const slot='2026112300',call=(agent,minute,fetcher=mock,s=slot)=>executeHourly({agent,slot:s,env,fetcher,nowFn:()=>slotWindow(agent,s).end-3600_000+minute*60_000+1});
 assert.equal((await call('TPW2',40)).state,'DEPENDENCIES_NOT_READY');
 assert.equal(called.length,0);
 assert.equal((await call('TPW1',0)).accepted,1);
 assert.equal((await call('TPW1',1)).state,'DUPLICATE_SUCCEEDED');
 assert.equal((await call('TPW2',40)).state,'DEPENDENCIES_NOT_READY');
 assert.equal((await call('TPW3',20)).accepted,1);
 const r=await call('TPW2',40);
 assert.equal(r.approved,2);assert.equal(r.githubWrites,0);assert.equal(r.quarantined,0);
 assert.equal(called.length,4);
 const variant=await deviceVariantKey(device),first=await readRevisionHead(db,variant);
 assert.ok(first?.revision_hash);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_revision_approvals').first()).n,1);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_source_rights').first()).n,2);
 assert.equal(r.runState,'SUCCEEDED');
 assert.equal((await call('TPW2',41)).state,'DUPLICATE_SUCCEEDED');
 assert.equal((await db.prepare("SELECT count(*) AS n FROM tpw_hourly_run WHERE slot=? AND state='SUCCEEDED'").bind(slot).first()).n,3);assert.ok(called.every(x=>!x.includes('github.com')));
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
 const next='2026112301';
 const empty=async()=>new Response(JSON.stringify({items:[]}),{headers:{'Content-Type':'application/json'}});
 const race=await Promise.all([call('TPW1',0,empty,next),call('TPW1',0,empty,next)]);
 assert.equal(race.filter(x=>x.runState==='SUCCEEDED').length,1);
 assert.equal(race.filter(x=>x.state.startsWith('DUPLICATE_')).length,1);
 assert.equal((await call('TPW3',20,async()=>{throw Error('SYNTHETIC_FEED_FAILURE')},next)).runState,'FAILED');
 assert.equal((await call('TPW3',21,empty,next)).state,'DUPLICATE_FAILED');
 assert.equal((await call('TPW2',40,empty,next)).state,'DEPENDENCIES_NOT_READY');
 assert.equal((await call('TPW2',60,empty,next)).state,'OUTSIDE_SLOT');
 assert.throws(()=>slotWindow('TPW1','2026023000'),/INVALID_RUN_SLOT/);
 // An abandoned run remains terminal failure rather than being stolen.
 const abandoned='2026112302',start=slotWindow('TPW1',abandoned).start;
 await db.prepare("INSERT INTO tpw_hourly_run(slot,agent,state,owner,started_at,deadline) VALUES (?,'TPW1','RUNNING','abandoned',?,?)").bind(abandoned,start,start+3600_000).run();
 await call('TPW1',0,empty,'2026112303');
 assert.equal((await db.prepare("SELECT state FROM tpw_hourly_run WHERE slot=? AND agent='TPW1'").bind(abandoned).first()).state,'FAILED');
 // A freshly fetched candidate may move only a never-claimed older PENDING row.
 const old='2026112304',fresh='2026112305',oldTime=slotWindow('TPW1',old).start;
 const newer=oldTime+3600_000;
 const official={...env,TPW1_SOURCE_FORMAT:'NEWS_API',TPW1_SOURCE_HOST:'official.example.org',TPW1_SOURCE_PUBLISHER:'Synthetic manufacturer'};
 const feed=async()=>new Response(JSON.stringify({items:[{title:news.title,url:news.source.url}]}),{headers:{'Content-Type':'application/json'}});
 const fetchHour=(s,at)=>executeHourly({agent:'TPW1',slot:s,env:official,fetcher:feed,nowFn:()=>at});
 assert.equal((await fetchHour(old,oldTime+1)).accepted,1);
 const oldRows=await readStage(db,oldTime+1,old);assert.equal(oldRows.length,1);
 assert.equal((await fetchHour(fresh,newer+1)).accepted,1);
 assert.equal((await readStage(db,newer+1,old)).length,0);
 const newRows=await readStage(db,newer+1,fresh);assert.equal(newRows.length,1);assert.equal(newRows[0].id,oldRows[0].id);
 assert.equal(newRows[0].candidate.observedAt,new Date(newer+1).toISOString());
 const lease=await claimStage(db,newRows[0].id,'55555555-5555-4555-8555-555555555555',newer+2,fresh);
 await finishStage(db,lease.id,'QUARANTINED',lease.leaseToken,newer+3);
 assert.equal((await fetchHour('2026112306',newer+3600_000+1)).accepted,0);
 const cutoff=newer+RUN_RETENTION_MS+3600_000;
 await cleanupStage(db,cutoff);
 assert.ok(await pruneHourlyRuns(db,cutoff)>0);
 assert.equal((await db.prepare("SELECT count(*) AS n FROM tpw_hourly_run WHERE finished_at<?").bind(cutoff-RUN_RETENTION_MS).first()).n,0);
 // Two editor-owned candidates for one variant race on the same previously reviewed head.
 const revSlot='2026112307',revAt=slotWindow('TPW2',revSlot).start+1,revOwner='synthetic-revision-owner';
 await db.prepare("INSERT INTO tpw_hourly_run(slot,agent,state,owner,started_at,deadline) VALUES (?,'TPW2','RUNNING',?,?,?)").bind(revSlot,revOwner,revAt,slotWindow('TPW2',revSlot).end).run();
 const scope={slot:revSlot,owner:revOwner,guard:async()=>{}};
 const x={...device,id:'device_revision_race_001'},y={...device,id:'device_revision_race_002'};
 await stageCandidates(db,[x,y],revAt,scope);
 const ox=await claimStage(db,x.id,'66666666-6666-4666-8666-666666666666',revAt,revSlot);
 const oy=await claimStage(db,y.id,'77777777-7777-4777-8777-777777777777',revAt,revSlot);
 const ax=await makeDoc(x),ay=await makeDoc(y);
 ax.device.specifications.screen.value='6.4';ay.device.specifications.screen.value='6.5';
 const attempt=async(owned,article,proof=undefined,dbOverride=db)=>appendReviewedRevision({env:{...env,TPW_DB:dbOverride},owned,article,expectedHead:first.revision_hash,scope,proof:proof??await makeProof(article,first.revision_hash,revSlot),nowFn:()=>revAt+1});
 const rightsBad=structuredClone(ax);rightsBad.sources[1].rights='PERMISSION_GRANTED';
 await assert.rejects(attempt(ox,rightsBad),/REVISION_RIGHTS_UNVERIFIED/);
 let px=await makeProof(ax,first.revision_hash,revSlot),py=await makeProof(ay,first.revision_hash,revSlot);
 const bad=structuredClone(px);bad.editorSignature=py.editorSignature;
 await assert.rejects(attempt(ox,ax,bad),/REVISION_SIGNATURE_INVALID/);
 const token=await candidateDigest(grantMessage(ax.sources[0],px.grants[0].expiresAt));
 const command=revokeMessage(token,0);
 const adminSig=await sign(adminKeys.privateKey,command);
 const wrongSig=await sign(editorKeys.privateKey,command);
 await assert.rejects(applyRevocation({env,token,epoch:0,signature:wrongSig,nowFn:()=>revAt}),/REVISION_SIGNATURE_INVALID/);
 assert.equal(await readAuthorityEpoch(db),0);
 await applyRevocation({env,token,epoch:0,signature:adminSig,nowFn:()=>revAt});
 assert.equal(await readAuthorityEpoch(db),1);
 await assert.rejects(applyRevocation({env,token,epoch:0,signature:adminSig,nowFn:()=>revAt}));
 const unrelated=await candidateDigest(['unrelated synthetic token']);
 const staleSig=await sign(adminKeys.privateKey,revokeMessage(unrelated,0));
 await assert.rejects(applyRevocation({env,token:unrelated,epoch:0,signature:staleSig,nowFn:()=>revAt}));
 await assert.rejects(attempt(ox,ax,px));
 const sameGrant=await makeProof(ax,first.revision_hash,revSlot,1);
 await assert.rejects(attempt(ox,ax,sameGrant));
 assert.equal((await readRevisionHead(db,variant)).revision_hash,first.revision_hash);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_revision_authority_events').first()).n,1);
 // Exact revoked grant stays revoked. A newly issued grant has its own expiry and signature.
 const freshExpiry=time+25*3600_000;
 const staleEpoch=await makeProof(ax,first.revision_hash,revSlot,0,freshExpiry);
 await assert.rejects(attempt(ox,ax,staleEpoch));
 px=await makeProof(ax,first.revision_hash,revSlot,1,freshExpiry);
 py=await makeProof(ay,first.revision_hash,revSlot,1,freshExpiry);
 console.log('PASS independent signed revocation admin, monotonic epoch CAS, stale proof and revoked grant denial without deletion');
 let lost=0;
 const ackLoss={prepare:db.prepare.bind(db),batch:async stmts=>{await db.batch(stmts);lost++;throw Error('SYNTHETIC_ACK_LOST')}};
 const outcomes=await Promise.allSettled([attempt(ox,ax,px,ackLoss),attempt(oy,ay,py,ackLoss)]);
 assert.equal(outcomes.filter(z=>z.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(z=>z.status==='rejected').length,1);
 assert.equal(lost,1);
 const win=outcomes[0].status==='fulfilled'?[ox,ax,px]:[oy,ay,py];
 assert.equal(outcomes.find(z=>z.status==='fulfilled').value.reconciled,true);
 assert.equal((await attempt(...win)).reconciled,true);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_revision_operations').first()).n,2);
 console.log('PASS signed editor previous-head binding, independent issuer, revocation fence, real D1 commit then simulated ACK loss, exact idempotent receipt');
 const head=await readRevisionHead(db,variant);
 assert.notEqual(head.revision_hash,first.revision_hash);
 const chain=await db.prepare('SELECT previous_hash FROM tpw_device_revisions WHERE revision_hash=?').bind(head.revision_hash).first();
 assert.equal(chain.previous_hash,first.revision_hash);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_device_revisions').first()).n,2);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_revision_approvals').first()).n,2);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tpw_source_rights').first()).n,4);
 console.log('PASS device revision D1 atomic chain, concurrent expected-head CAS, TPW2 receipt and synthetic rights denial');
 console.log('PASS official-source re-observation moves only older pending candidate; terminal tombstone denied; 30-day terminal retention');
 console.log('PASS same-slot D1 dependencies, duplicate CAS, failed feed, expired run, late trigger and abandoned owner');
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
 wranglerSync(['d1','execute','topwhiz-tpw-synthetic-ci','--config',localconfig,'--local','--persist-to',tmp,'--file',hourlySchema]);
 wranglerSync(['d1','execute','topwhiz-tpw-synthetic-ci','--config',localconfig,'--local','--persist-to',tmp,'--file',revisionSchema]);
 wranglerSync(['d1','execute','topwhiz-tpw-synthetic-ci','--config',localconfig,'--local','--persist-to',tmp,'--file',proofSchema]);
 wranglerSync(['d1','execute','topwhiz-tpw-synthetic-ci','--config',localconfig,'--local','--persist-to',tmp,'--file',authoritySchema]);
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
