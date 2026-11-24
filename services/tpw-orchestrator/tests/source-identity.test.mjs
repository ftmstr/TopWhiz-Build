import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CATALOG} from '../src/source-catalog.mjs';
import {resolveReviewedAlias,compareVariantRevision} from '../src/source-identity.mjs';
import {readOfficialSource} from '../src/official-source.mjs';
const host='vendor.example.org',base='https://'+host,now=Date.UTC(2026,10,24);
test('research catalog cannot authorize private pilot or grant rights',async()=>{
 assert.equal(new Set(SOURCE_CATALOG.map(x=>x.id)).size,SOURCE_CATALOG.length);
 assert.ok(SOURCE_CATALOG.every(x=>x.status==='DISCOVERY_ONLY'&&x.rights==='UNVERIFIED'&&x.feedUrl===null));
 let calls=0;await assert.rejects(readOfficialSource({TPW_MODE:'PRIVATE_PILOT'},'TPW1',async()=>{calls++},now),/SOURCE_CATALOG_NO_APPROVED_CONNECTOR/);assert.equal(calls,0);
});
test('explicit reviewed aliases only, no cross-host, chains, duplicate or implicit query stripping',()=>{
 const a=base+'/a',c=base+'/canonical',alias=[{alias:a,canonical:c}];
 assert.equal(resolveReviewedAlias(a,host,alias),c);
 assert.equal(resolveReviewedAlias(a+'?variant=1',host,alias),a+'?variant=1');
 for(const rows of [[...alias,{alias:c,canonical:a}],[...alias,...alias],[{alias:a,canonical:'https://other.example.org/a'}]])assert.throws(()=>resolveReviewedAlias(a,host,rows));
});
const env={TPW_MODE:'LOCAL_DRY_RUN',TPW1_SOURCE_FORMAT:'NEWS_API',TPW1_FEED_URL:base+'/feed',TPW1_FEED_HOST:host,TPW1_SOURCE_HOST:host,TPW1_SOURCE_PUBLISHER:'Synthetic Vendor',TPW1_SOURCE_ALIASES_JSON:JSON.stringify([{alias:base+'/alias',canonical:base+'/canonical'}])};
const fetchRows=items=>async()=>new Response(JSON.stringify({items}),{headers:{'Content-Type':'application/json'}});
test('alias canonicalizes before id hashing and conflicts cannot be silently deduplicated',async()=>{
 const a={title:'Synthetic source title',url:base+'/alias'},b={...a,url:base+'/canonical'};
 const x=await readOfficialSource(env,'TPW1',fetchRows([a,b]),now);
 assert.equal(x.approved.length,1);assert.equal(x.approved[0].source.url,b.url);assert.equal(x.stats.duplicates,1);
 await assert.rejects(readOfficialSource(env,'TPW1',fetchRows([a,{...b,title:'Conflicting synthetic title'}]),now),/SOURCE_IDENTITY_CONFLICT/);
});
const h='a'.repeat(64),at='2026-11-24T00:00:00Z';
const doc=()=>({schemaVersion:'1.0',id:'device_revision_fixture',kind:'device',status:'APPROVED',title:{tr:'Sentetik cihaz',en:'Synthetic device'},summary:{tr:'Sadece sentetik test verisidir.',en:'Synthetic testing data only.'},body:{tr:'Bu tamamen kurgusal bir cihaz teknik veri testidir.',en:'This is an entirely fictional device specification test.'},publishedAt:at,sourceDigest:h,media:[],review:{agent:'TPW2',decision:'APPROVED',factCheck:'VERIFIED',rightsCheck:'CLEARED',translationCheck:'VERIFIED',reviewedAt:at,evidenceHash:h},sources:[{url:base+'/specs',publisher:'Synthetic Vendor',rights:'LINK_ONLY',type:'PRIMARY',checkedAt:at,claimHash:h}],device:{brand:'Example',model:'Example P',sku:'EX-001',region:'TR',specifications:{screen:{value:'6.3',unit:'inch',sourceHash:h},battery:{value:'5000',unit:'mAh',sourceHash:h}}}});
test('variant revision distinguishes changed values, changed evidence and different SKU/region',async()=>{
 const a=doc(),b=doc();b.device.specifications={battery:b.device.specifications.battery,screen:b.device.specifications.screen};
 assert.equal((await compareVariantRevision(a,b)).state,'UNCHANGED');
 b.device.specifications.screen.value='6.4';assert.equal((await compareVariantRevision(a,b)).state,'DATA_CHANGE_REVIEW_REQUIRED');
 const c=doc();c.sources[0].claimHash='b'.repeat(64);for(const s of Object.values(c.device.specifications))s.sourceHash=c.sources[0].claimHash;
 assert.equal((await compareVariantRevision(a,c)).state,'EVIDENCE_CHANGE_REVIEW_REQUIRED');
 c.device.region='US';await assert.rejects(compareVariantRevision(a,c),/REVISION_VARIANT_MISMATCH/);
});
