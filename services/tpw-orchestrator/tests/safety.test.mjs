import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify,sign} from 'node:crypto';
import {editorialApprovalBytes,verifyEditorialApproval} from '../src/editorial-proof.mjs';
import {slotForCron,preflightCandidate,publicationGate,safeApprovedPath} from '../src/policy.mjs';
import {prefilterFeed,boundedJson,assertTrustedEndpoint} from '../src/adapters.mjs';
import {candidateDigest,originMatches} from '../src/lineage.mjs';
import {commitApprovedContent,issueInstallationToken,appJwt} from '../src/github-app.mjs';
import {executeAgent} from '../src/runner.mjs';
const when='2026-11-23T00:00:00Z',sha='f'.repeat(64);
const src={url:'https://vendor.example.org/specs',publisher:'Vendor',rights:'LINK_ONLY',type:'PRIMARY'};
const cand=()=>({id:'news_fixture_001',kind:'news',source:{...src},observedAt:when,title:'Synthetic official technology announcement'});
async function article(c=cand()){return {schemaVersion:'1.0',id:c.id,kind:c.kind,status:'APPROVED',title:{tr:'Özgün deneme haberi',en:'Original sample news'},summary:{tr:'Bu içerik yalnızca laboratuvar testi içindir.',en:'This item exists only for a laboratory test.'},body:{tr:'Tamamen kurmaca bir örnek haber metni. Hiçbir gerçek haber veya ürün iddiası bulunmaz.',en:'Entirely fictional sample article text. It makes no claim about an actual news event or product.'},sources:[{...src,checkedAt:when,claimHash:sha},{url:'https://reviewer.example.org',publisher:'Reviewer',type:'INDEPENDENT',rights:'LINK_ONLY',checkedAt:when,claimHash:sha}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:when,evidenceHash:sha},media:[],publishedAt:when,sourceDigest:await candidateDigest(c)}}
const deep=x=>structuredClone(x);
test('3 UTC schedules produce deterministic distinct IDs',()=>{for(const [cron,agent,minute] of [['0 * * * *','TPW1',0],['20 * * * *','TPW3',20],['40 * * * *','TPW2',40]]){let p=slotForCron(cron,Date.UTC(2026,10,23,1,minute));assert.equal(p.agent,agent);assert.match(p.id,/^tpw-/)}assert.throws(()=>slotForCron('45 * * * *',Date.now()))});
test('preflight cannot stage unlicensed full article or nested payload',()=>{let a=cand();assert.equal(preflightCandidate(a).ok,true);a.body='copyrighted';assert.equal(preflightCandidate(a).ok,false);delete a.body;a.source.hidden='source body';assert.equal(preflightCandidate(a).ok,false)});
test('feed removes duplicates before any persistence',()=>{let a=cand(),b=deep(a);b.content='bad';let x=prefilterFeed({items:[a,a,b]},'news');assert.equal(x.approved.length,1);assert.equal(x.stats.rejected,1);assert.equal(x.stats.duplicates,1)});
test('approved content requires full TR and EN and editor provenance',async()=>{let a=await article();assert.equal(publicationGate(a,{releaseGate:'OPEN'}).ok,true);delete a.body.en;assert.equal(publicationGate(a,{releaseGate:'OPEN'}).ok,false)});
test('review flags cannot override a source-corroboration failure',async()=>{let a=await article();a.sources.length=1;assert.equal(publicationGate(a,{releaseGate:'OPEN'}).ok,false)});
test('media, rejected status and traversal paths fail closed',async()=>{let a=await article();a.media=[{url:'https://image.example'}];assert.equal(publicationGate(a,{releaseGate:'OPEN'}).ok,false);a=await article();a.status='REJECTED';assert.equal(publicationGate(a,{releaseGate:'OPEN'}).ok,false);assert.throws(()=>safeApprovedPath({id:'../../secret',kind:'news'}))});
test('global web release gate remains closed',async()=>assert.ok(publicationGate(await article()).errors.includes('GLOBAL_RELEASE_NO_GO')));
test('candidate digest and primary-source binding prevent editor substitution',async()=>{const c=cand(),a=await article(c);assert.equal(a.sourceDigest,await candidateDigest(c));assert.equal(originMatches(c,a),true);a.sources[0].url='https://bad.example';assert.equal(originMatches(c,a),false)});
test('feed denies other endpoints before network request',async()=>{let calls=0;await assert.rejects(boundedJson('https://evil.example','https://vendor.example',async()=>{calls++}));assert.equal(calls,0)});
test('disabled mode cannot access GitHub/network/D1',async()=>{let calls=0;const r=await executeAgent({agent:'TPW1',env:{TPW_MODE:'CLOSED'},fetcher:async()=>{calls++;throw Error('no')}});assert.equal(r.githubWrites,0);assert.equal(calls,0)});
test('missing D1 remains fail closed',async()=>await assert.rejects(executeAgent({agent:'TPW1',env:{TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED'}})));
test('GitHub writer refuses main and public repository before token issuance',async()=>{let calls=0;const env={TPW_MODE:'PRIVATE_PILOT',TPW_GITHUB_WRITES:'ENABLED',TPW_RELEASE_GATE:'CLOSED',GITHUB_OWNER:'ftmstr',GITHUB_REPO:'TopWhiz-Build',GITHUB_BRANCH:'main',TPW_CONTENT_REPO_PRIVATE_CONFIRMED:'YES'};await assert.rejects(commitApprovedContent(env,await article(),async()=>{calls++;throw Error('network')}));assert.equal(calls,0)});
test('GitHub writer also refuses private repo without external private confirmation',async()=>{const env={TPW_MODE:'PRIVATE_PILOT',TPW_GITHUB_WRITES:'ENABLED',TPW_RELEASE_GATE:'CLOSED',GITHUB_OWNER:'ftmstr',GITHUB_REPO:'TopWhiz-Content-Private',GITHUB_BRANCH:'content-approved-pilot'};await assert.rejects(commitApprovedContent(env,await article(),async()=>{throw Error('network')}))});
test('no installation token when disabled',async()=>{let calls=0;await assert.rejects(issueInstallationToken({TPW_MODE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED'},async()=>{calls++}));assert.equal(calls,0)});
test('WebCrypto GitHub App JWT validates as RS256 with bounded lifetime',async()=>{const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const token=await appJwt('1234',privateKey.export({format:'pem',type:'pkcs8'}),1700000000);const [h,p,s]=token.split('.');const payload=JSON.parse(Buffer.from(p,'base64url'));assert.equal(payload.exp-payload.iat,540);assert.ok(verify('RSA-SHA256',Buffer.from(h+'.'+p),publicKey,Buffer.from(s,'base64url')))});

function pilotEnv(){
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const {privateKey:editorSigningKey,publicKey:editorPublicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 return {__editorSigningKey:editorSigningKey,TPW_EDITOR_PUBLIC_KEY_SPKI_B64:editorPublicKey.export({format:'der',type:'spki'}).toString('base64'),TPW_MODE:'PRIVATE_PILOT',TPW_GITHUB_WRITES:'ENABLED',TPW_RELEASE_GATE:'CLOSED',GITHUB_OWNER:'ftmstr',GITHUB_REPO:'TopWhiz-Content-Private',GITHUB_BRANCH:'content-approved-pilot',TPW_CONTENT_REPO_PRIVATE_CONFIRMED:'YES',GITHUB_APP_ID:'12345',GITHUB_APP_PRIVATE_KEY:privateKey.export({format:'pem',type:'pkcs8'}),GITHUB_INSTALLATION_ID:'23456',GITHUB_REPO_ID:'34567'};
}
async function signedArticle(env,c=cand()){const doc=await article(c);doc.review.signature=sign('sha256',Buffer.from(editorialApprovalBytes(doc)),{key:env.__editorSigningKey,dsaEncoding:'ieee-p1363'}).toString('base64url');return doc;}
const privateMetadata=()=>({id:34567,name:'TopWhiz-Content-Private',full_name:'ftmstr/TopWhiz-Content-Private',owner:{login:'ftmstr'},private:true,visibility:'private',archived:false});
function fakeGitHub(metadata,track,sha='b'.repeat(40)){
 return async (url,init)=>{
  track.push({url,method:init.method,body:init.body});
  if(url.endsWith('/access_tokens'))return new Response(JSON.stringify({token:'ghs_synthetic_pilot_token'}),{status:201});
  if(init.method==='GET'&&url.includes('/contents/'))return new Response(null,{status:404});
  if(init.method==='GET')return new Response(JSON.stringify(metadata),{status:200});
  if(init.method==='PUT')return new Response(JSON.stringify({commit:{sha}}),{status:201});
  throw new Error('UNEXPECTED_EXTERNAL_ACCESS');
 };
}
test('independent GitHub privacy query before PUT: public metadata blocks write',async()=>{
 const calls=[],env=pilotEnv(),metadata={...privateMetadata(),private:false,visibility:'public'};
 await assert.rejects(commitApprovedContent(env,await signedArticle(env),fakeGitHub(metadata,calls),async()=>{}),/GITHUB_TARGET_NOT_PRIVATE_VERIFIED/);
 assert.deepEqual(calls.map(x=>x.method),['POST','GET']);
});
test('GitHub metadata identity, numeric repo id, archive state and visibility fail closed',async()=>{
 const env=pilotEnv(),doc=await signedArticle(env);
 for(const mutate of [x=>x.id=12,x=>x.owner.login='attacker',x=>x.archived=true,x=>x.visibility='public',x=>delete x.private]){
  const obj=privateMetadata();mutate(obj);const calls=[];
  await assert.rejects(commitApprovedContent(env,doc,fakeGitHub(obj,calls),async()=>{}),/GITHUB_TARGET_NOT_PRIVATE_VERIFIED/);
  assert.equal(calls.filter(x=>x.method==='PUT').length,0);
 }
});
test('verified private target permits a single synthetic pilot PUT, not main',async()=>{
 const calls=[],env=pilotEnv(),doc=await signedArticle(env);
 const result=await commitApprovedContent(env,doc,fakeGitHub(privateMetadata(),calls),async()=>{});
 assert.equal(result.status,'PRIVATE_PILOT_ONLY');assert.equal(result.sha,'b'.repeat(40));
 assert.deepEqual(calls.map(x=>x.method),['POST','GET','GET','PUT']);
 assert.equal(JSON.parse(calls[3].body).branch,'content-approved-pilot');
});
test('GitHub create HTTP 201 without verifiable commit SHA is NOT accepted',async()=>{
 const calls=[],env=pilotEnv();
 await assert.rejects(commitApprovedContent(env,await signedArticle(env),fakeGitHub(privateMetadata(),calls,''),async()=>{}),/GITHUB_CREATE_RESPONSE_UNVERIFIED/);
 assert.equal(calls.filter(x=>x.method==='PUT').length,1);
});
test('GitHub repo ids must not exceed Javascript safe integer precision',async()=>{
 let attempts=0;
 await assert.rejects(issueInstallationToken({...pilotEnv(),GITHUB_REPO_ID:'99999999999999999999'},async()=>{attempts++;throw Error('NO_FETCH')}),/BAD_GITHUB_IDS/);
 assert.equal(attempts,0);
});

test('pinned feed host allowlist rejects unconfigured and SSRF-like endpoints before fetch',async()=>{
 const url='https://feeds.example.org/news.json';
 assert.equal(assertTrustedEndpoint(url,url,'feeds.example.org'),url);
 let n=0,net=async()=>{n++;return new Response(JSON.stringify({items:[]}),{headers:{'Content-Type':'application/json'}})};
 for(const [bad,allow,host] of [
  [url,url,undefined],
  [url,url,'other.example.org'],
  ['https://user:pass@feeds.example.org/news.json','https://user:pass@feeds.example.org/news.json','feeds.example.org'],
  ['https://feeds.example.org:444/news.json','https://feeds.example.org:444/news.json','feeds.example.org'],
  ['https://127.0.0.1/news.json','https://127.0.0.1/news.json','127.0.0.1'],
  ['https://localhost/news.json','https://localhost/news.json','localhost'],
  ['https://feeds.example.org/news.json#frag','https://feeds.example.org/news.json#frag','feeds.example.org'],
  ['http://feeds.example.org/news.json','http://feeds.example.org/news.json','feeds.example.org']
 ])await assert.rejects(boundedJson(bad,allow,net,host),/ENDPOINT_NOT_ALLOWLISTED/);
 assert.equal(n,0);
 const ok=await boundedJson(url,url,net,'feeds.example.org');assert.deepEqual(ok,{items:[]});assert.equal(n,1);
});
test('source adapter refuses an observed redirected final response',async()=>{
 const url='https://feeds.example.org/items';let response=new Response(JSON.stringify({items:[]}),{headers:{'Content-Type':'application/json'}});
 Object.defineProperty(response,'url',{value:'https://attacker.example.org/payload'});
 await assert.rejects(boundedJson(url,url,async()=>response,'feeds.example.org'),/BAD_FEED_HTTP/);
});
test('pilot refuses unsigned editorial decisions before GitHub token issuance',async()=>{
 const env=pilotEnv(),calls=[];
 await assert.rejects(commitApprovedContent(env,await article(),fakeGitHub(privateMetadata(),calls),async()=>{}),/EDITOR_PROOF_ENCODING_INVALID/);
 assert.equal(calls.length,0);
});
test('pinned ECDSA P-256 editor approval verifies, tampered TR/EN body fails',async()=>{
 const env=pilotEnv(),doc=await signedArticle(env);
 assert.equal(await verifyEditorialApproval(doc,env.TPW_EDITOR_PUBLIC_KEY_SPKI_B64),true);
 const bad=structuredClone(doc);bad.title.en='An altered English headline';
 await assert.rejects(verifyEditorialApproval(bad,env.TPW_EDITOR_PUBLIC_KEY_SPKI_B64),/EDITOR_SIGNATURE_INVALID/);
});
test('signed approval cannot be replayed on a different candidate digest or factual evidence',async()=>{
 const env=pilotEnv(),doc=await signedArticle(env);
 for(const field of ['sourceDigest','evidenceHash','reviewedAt']){
  const altered=structuredClone(doc);
  if(field==='sourceDigest')altered.sourceDigest='e'.repeat(64);
  if(field==='evidenceHash')altered.review.evidenceHash='e'.repeat(64);
  if(field==='reviewedAt')altered.review.reviewedAt='2026-11-23T01:00:00Z';
  await assert.rejects(verifyEditorialApproval(altered,env.TPW_EDITOR_PUBLIC_KEY_SPKI_B64),/EDITOR_SIGNATURE_INVALID/);
 }
});
test('separately generated editor signing key cannot impersonate the pinned editor',async()=>{
 const env=pilotEnv(),other=pilotEnv(),doc=await signedArticle(other),calls=[];
 await assert.rejects(commitApprovedContent(env,doc,fakeGitHub(privateMetadata(),calls),async()=>{}),/EDITOR_SIGNATURE_INVALID/);
 assert.equal(calls.length,0);
});

function githubAckLossSimulator(calls,{existingPayload=null,commitAckLost=true}={}){
 let existing=existingPayload;
 const blob='d'.repeat(40);
 return async(url,init)=>{
  calls.push({url,method:init.method});
  if(url.endsWith('/access_tokens'))return new Response(JSON.stringify({token:'ghs_synthetic_pilot_token'}),{status:201});
  if(init.method==='GET'&&!url.includes('/contents/'))return new Response(JSON.stringify(privateMetadata()),{status:200});
  if(init.method==='GET'&&url.includes('/contents/')){
   if(!existing)return new Response(null,{status:404});
   const path=url.split('/contents/')[1].split('?')[0];
   return new Response(JSON.stringify({type:'file',encoding:'base64',size:Buffer.from(existing,'base64').length,path,sha:blob,content:existing}),{status:200});
  }
  if(init.method==='PUT'&&url.includes('/contents/')){
   if(existing)return new Response(JSON.stringify({message:'already exists'}),{status:422});
   existing=JSON.parse(init.body).content;
   if(commitAckLost)throw Error('SIMULATED_COMMIT_SUCCEEDED_ACK_LOST');
   return new Response(JSON.stringify({commit:{sha:'b'.repeat(40)}}),{status:201});
  }
  throw Error('UNEXPECTED_REQUEST');
 };
}
test('lost GitHub 201 ACK reconciles exact signed content and NEVER retries PUT',async()=>{
 const env=pilotEnv(),doc=await signedArticle(env),calls=[];
 const fetcher=githubAckLossSimulator(calls);
 const first=await commitApprovedContent(env,doc,fetcher,async()=>{});
 assert.equal(first.status,'ACK_LOST_MATCH_RECONCILED');
 assert.equal(first.sha,null);assert.match(first.blobSha,/^[a-f0-9]{40}$/);
 assert.equal(calls.filter(x=>x.method==='PUT').length,1);
 const second=await commitApprovedContent(env,doc,fetcher,async()=>{});
 assert.equal(second.status,'EXISTING_IDENTICAL_VERIFIED');
 assert.equal(calls.filter(x=>x.method==='PUT').length,1);
});
test('pre-existing conflicting immutable content denies any GitHub update',async()=>{
 const env=pilotEnv(),doc=await signedArticle(env),calls=[];
 const fetcher=githubAckLossSimulator(calls,{existingPayload:Buffer.from('malicious conflict').toString('base64')});
 await assert.rejects(commitApprovedContent(env,doc,fetcher,async()=>{}),/GITHUB_PATH_CONFLICT/);
 assert.equal(calls.filter(x=>x.method==='PUT').length,0);
});
test('lost ACK with no independently readable exact blob remains uncertain and does not retry',async()=>{
 const env=pilotEnv(),doc=await signedArticle(env),calls=[];
 const f=githubAckLossSimulator(calls,{commitAckLost:true});
 const fetcher=async(url,init)=>{
  if(init.method==='GET'&&url.includes('/contents/')&&calls.some(x=>x.method==='PUT')){
   calls.push({url,method:init.method});
   return new Response(null,{status:404});
  }
  return f(url,init);
 };
 await assert.rejects(commitApprovedContent(env,doc,fetcher,async()=>{}),/GITHUB_COMMIT_ACK_UNCERTAIN/);
 assert.equal(calls.filter(x=>x.method==='PUT').length,1);
});
test('expired lease immediately before GitHub create-only PUT denies write after auth',async()=>{
 const env=pilotEnv(),doc=await signedArticle(env),calls=[];
 const fetcher=githubAckLossSimulator(calls,{commitAckLost:false});
 let checks=0;
 await assert.rejects(commitApprovedContent(env,doc,fetcher,async()=>{checks++;throw Error('LEASE_LOST_NO_GITHUB_WRITE')}),/LEASE_LOST_NO_GITHUB_WRITE/);
 assert.equal(checks,1);
 assert.equal(calls.filter(x=>x.method==='PUT').length,0);
});
test('pilot writer requires D1 lease guard rather than trusting a caller-supplied flag',async()=>{
 const env=pilotEnv(),doc=await signedArticle(env),calls=[];
 await assert.rejects(commitApprovedContent(env,doc,githubAckLossSimulator(calls)),/D1_LEASE_GUARD_REQUIRED/);
 assert.equal(calls.length,0);
});
