import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNewsXML,readOfficialSource} from '../src/official-source.mjs';
const now=Date.UTC(2026,10,24),url='https://vendor.example.org/news/one';
const env={TPW1_FEED_URL:'https://vendor.example.org/feed',TPW1_FEED_HOST:'vendor.example.org',TPW1_SOURCE_HOST:'vendor.example.org',TPW1_SOURCE_PUBLISHER:'Synthetic Vendor',TPW1_SOURCE_FORMAT:'RSS'};
const rss='<rss version="2.0"><channel><item><title>Synthetic &amp; official news</title><link>'+url+'</link><description><![CDATA[unlicensed full text]]></description></item></channel></rss>';
const atom='<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Synthetic &amp; official news</title><link rel="alternate" href="'+url+'"/><content>discard me</content></entry></feed>';
const response=(s,m='application/rss+xml')=>async()=>new Response(s,{headers:{'Content-Type':m}});
test('RSS and Atom yield only pinned metadata and same deterministic source identity',async()=>{
 const a=await readOfficialSource(env,'TPW1',response(rss),now);
 const b=await readOfficialSource({...env,TPW1_SOURCE_FORMAT:'ATOM'},'TPW1',response(atom,'application/atom+xml'),now+1);
 assert.equal(a.approved[0].id,b.approved[0].id);
 assert.equal(a.approved[0].title,'Synthetic & official news');
 assert.equal(a.approved[0].source.publisher,'Synthetic Vendor');
 assert.equal(a.approved[0].source.rights,'LINK_ONLY');
 assert.ok(!JSON.stringify(a).includes('unlicensed'));
 assert.notEqual(a.approved[0].observedAt,b.approved[0].observedAt);
});
test('XML DTD, entity, namespace override, ambiguous alternate and bad nesting denied',()=>{
 for(const bad of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///tmp/x">]>'+rss,rss.replace('&amp;','&x;'),rss.replace('<item>','<item xmlns="urn:other">'),rss.replace('</item>','</entry>')])assert.throws(()=>parseNewsXML(bad,'RSS'));
 assert.throws(()=>parseNewsXML(atom.replace('</entry>','<link href="'+url+'"/></entry>'),'ATOM'));
});
test('RSS cannot choose another source host, URL credentials or noncanonical links',async()=>{
 for(const bad of ['https://evil.example.org/news','https://user@vendor.example.org/news','http://vendor.example.org/news','https://vendor.example.org/news#fragment'])await assert.rejects(readOfficialSource(env,'TPW1',response(rss.replace(url,bad)),now));
});
test('JSON API cannot supply its own publisher, permission or body',async()=>{
 const e={...env,TPW1_SOURCE_FORMAT:'NEWS_API'};
 const item={url,title:'Synthetic source title'};
 const get=items=>response(JSON.stringify({items}),'application/json');
 assert.equal((await readOfficialSource(e,'TPW1',get([item]),now)).approved.length,1);
 for(const bad of [{publisher:'Attacker'},{rights:'PERMISSION_GRANTED'},{body:'unlicensed text'}])await assert.rejects(readOfficialSource(e,'TPW1',get([{...item,...bad}]),now));
});
test('manufacturer API pins brand and differentiates regional SKU identity',async()=>{
 const e={TPW3_FEED_URL:env.TPW1_FEED_URL,TPW3_FEED_HOST:env.TPW1_FEED_HOST,TPW3_SOURCE_HOST:env.TPW1_SOURCE_HOST,TPW3_SOURCE_PUBLISHER:'Synthetic Vendor',TPW3_SOURCE_FORMAT:'DEVICE_API',TPW3_SOURCE_BRAND:'Example'};
 const x={url,title:'Synthetic manufacturer product',device:{brand:'Example',model:'Example P',sku:'EX-001',region:'TR'}};
 const read=items=>readOfficialSource(e,'TPW3',response(JSON.stringify({items}),'application/json'),now);
 const a=await read([x,{...x,device:{...x.device,region:'US'}}]);
 assert.equal(a.approved.length,2);assert.notEqual(a.approved[0].id,a.approved[1].id);
 await assert.rejects(read([{...x,device:{...x.device,brand:'Fake'}}]));
});
test('wrong mime and missing trusted identity fail closed',async()=>{
 await assert.rejects(readOfficialSource(env,'TPW1',response(rss,'text/html'),now));
 let calls=0;await assert.rejects(readOfficialSource({...env,TPW1_SOURCE_PUBLISHER:''},'TPW1',async()=>{calls++;},now));assert.equal(calls,0);
});
