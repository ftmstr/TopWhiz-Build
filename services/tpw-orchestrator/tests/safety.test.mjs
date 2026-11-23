import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {slotForCron,preflightCandidate,publicationGate,safeApprovedPath} from '../src/policy.mjs';
import {prefilterFeed,boundedJson} from '../src/adapters.mjs';
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
 return {TPW_MODE:'PRIVATE_PILOT',TPW_GITHUB_WRITES:'ENABLED',TPW_RELEASE_GATE:'CLOSED',GITHUB_OWNER:'ftmstr',GITHUB_REPO:'TopWhiz-Content-Private',GITHUB_BRANCH:'content-approved-pilot',TPW_CONTENT_REPO_PRIVATE_CONFIRMED:'YES',GITHUB_APP_ID:'12345',GITHUB_APP_PRIVATE_KEY:privateKey.export({format:'pem',type:'pkcs8'}),GITHUB_INSTALLATION_ID:'23456',GITHUB_REPO_ID:'34567'};
}
const privateMetadata=()=>({id:34567,name:'TopWhiz-Content-Private',full_name:'ftmstr/TopWhiz-Content-Private',owner:{login:'ftmstr'},private:true,visibility:'private',archived:false});
function fakeGitHub(metadata,track,sha='b'.repeat(40)){
 return async (url,init)=>{
  track.push({url,method:init.method,body:init.body});
  if(url.endsWith('/access_tokens'))return new Response(JSON.stringify({token:'ghs_synthetic_pilot_token'}),{status:201});
  if(init.method==='GET')return new Response(JSON.stringify(metadata),{status:200});
  if(init.method==='PUT')return new Response(JSON.stringify({commit:{sha}}),{status:201});
  throw new Error('UNEXPECTED_EXTERNAL_ACCESS');
 };
}
test('independent GitHub privacy query before PUT: public metadata blocks write',async()=>{
 const calls=[],env=pilotEnv(),metadata={...privateMetadata(),private:false,visibility:'public'};
 await assert.rejects(commitApprovedContent(env,await article(),fakeGitHub(metadata,calls)),/GITHUB_TARGET_NOT_PRIVATE_VERIFIED/);
 assert.deepEqual(calls.map(x=>x.method),['POST','GET']);
});
test('GitHub metadata identity, numeric repo id, archive state and visibility fail closed',async()=>{
 const env=pilotEnv(),doc=await article();
 for(const mutate of [x=>x.id=12,x=>x.owner.login='attacker',x=>x.archived=true,x=>x.visibility='public',x=>delete x.private]){
  const obj=privateMetadata();mutate(obj);const calls=[];
  await assert.rejects(commitApprovedContent(env,doc,fakeGitHub(obj,calls)),/GITHUB_TARGET_NOT_PRIVATE_VERIFIED/);
  assert.equal(calls.filter(x=>x.method==='PUT').length,0);
 }
});
test('verified private target permits a single synthetic pilot PUT, not main',async()=>{
 const calls=[],env=pilotEnv(),doc=await article();
 const result=await commitApprovedContent(env,doc,fakeGitHub(privateMetadata(),calls));
 assert.equal(result.status,'PRIVATE_PILOT_ONLY');assert.equal(result.sha,'b'.repeat(40));
 assert.deepEqual(calls.map(x=>x.method),['POST','GET','PUT']);
 assert.equal(JSON.parse(calls[2].body).branch,'content-approved-pilot');
});
test('GitHub create HTTP 201 without verifiable commit SHA is NOT accepted',async()=>{
 const calls=[],env=pilotEnv();
 await assert.rejects(commitApprovedContent(env,await article(),fakeGitHub(privateMetadata(),calls,'')),/GITHUB_CREATE_RESPONSE_UNVERIFIED/);
 assert.equal(calls.filter(x=>x.method==='PUT').length,1);
});
test('GitHub repo ids must not exceed Javascript safe integer precision',async()=>{
 let attempts=0;
 await assert.rejects(issueInstallationToken({...pilotEnv(),GITHUB_REPO_ID:'99999999999999999999'},async()=>{attempts++;throw Error('NO_FETCH')}),/BAD_GITHUB_IDS/);
 assert.equal(attempts,0);
});
