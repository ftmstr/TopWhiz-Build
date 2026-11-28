import test from 'node:test';
import assert from 'node:assert/strict';
import {requestEditorialReview} from '../src/editor-client.mjs';
import {candidateDigest} from '../src/lineage.mjs';
const at='2026-11-23T00:00:00Z',h='a'.repeat(64);
const source={url:'https://official.example.org/synthetic',publisher:'Synthetic manufacturer',rights:'LINK_ONLY',type:'PRIMARY'};
const candidate={id:'news_editor_fixture_001',kind:'news',source,observedAt:at,title:'Synthetic editor boundary test'};
const env={TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED',TPW_EDITOR_API_URL:'https://editor.example.org/review',TPW_EDITOR_ALLOWED_HOST:'editor.example.org',TPW_EDITOR_API_TOKEN:'synthetic-test-only'};
const doc=async()=>({schemaVersion:'1.0',id:candidate.id,kind:'news',status:'APPROVED',title:{tr:'Sentetik haber testi',en:'Synthetic news fixture'},summary:{tr:'Sadece yerel sentetik test verisi.',en:'Only local synthetic test data.'},body:{tr:'Bu tamamen kurgusal bir test metnidir, gerçek haber değildir.',en:'This completely fictional test document is not a real news article.'},sources:[{...source,checkedAt:at,claimHash:h},{url:'https://independent.example.net/test',publisher:'Independent synthetic test',rights:'LINK_ONLY',type:'INDEPENDENT',checkedAt:at,claimHash:h}],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:h},media:[],publishedAt:at,sourceDigest:await candidateDigest(candidate)});
const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
test('editor accepts bounded synthetic response and sends exact request',async()=>{
 const article=await doc();
 const x=await requestEditorialReview({env,candidate,fetcher:async(url,init)=>{assert.equal(url,env.TPW_EDITOR_API_URL);assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer '+env.TPW_EDITOR_API_TOKEN);assert.deepEqual(JSON.parse(init.body),{schemaVersion:'1.0',candidate});return json(article)}});
 assert.deepEqual(x.article,article);
});
test('real pilot and real endpoints denied before transport',async()=>{
 let calls=0;const f=async()=>{calls++;return json({})};
 await assert.rejects(requestEditorialReview({env:{...env,TPW_MODE:'PRIVATE_PILOT'},candidate,fetcher:f}),/EDITOR_REAL_CONNECTION_BLOCKED/);
 await assert.rejects(requestEditorialReview({env:{...env,TPW_EDITOR_API_URL:'https://editor.invalid/review',TPW_EDITOR_ALLOWED_HOST:'editor.invalid'},candidate,fetcher:f}),/EDITOR_SYNTHETIC_ENDPOINT_REQUIRED/);
 assert.equal(calls,0);
});
test('editor rejects HTTP MIME, oversized output, and altered source lineage',async()=>{
 const article=await doc();
 for(const response of [new Response(JSON.stringify(article)),new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),json({...article,sourceDigest:'b'.repeat(64)})]){
  await assert.rejects(requestEditorialReview({env,candidate,fetcher:async()=>response}));
 }
});
test('editor deadline fails closed even if synthetic transport ignores abort',async()=>{
 let signal;
 await assert.rejects(requestEditorialReview({env,candidate,timeoutMs:10,fetcher:async(_u,init)=>{signal=init.signal;return new Promise(()=>{})}}),/EDITOR_TIMEOUT/);
 assert.equal(signal.aborted,true);
});
