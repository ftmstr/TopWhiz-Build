import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startLocalText} from '../../../local-text/server.mjs';
test('isolated text demo serves only three text assets and blocks direct media paths',async()=>{
 const {server,url}=await startLocalText(0);
 try{
  assert.equal(server.address().address,'127.0.0.1');
  for(const p of ['', 'site.css','site.js']){
   const r=await fetch(url+p);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-security-policy'),/media-src 'none'/);assert.match(r.headers.get('content-security-policy'),/connect-src 'none'/);assert.ok((await r.text()).length>0);
  }
  for(const p of ['media/cms/test','v1/media/test','_next/image','brand/logo.png','dragon-point-video/','assets/topwhiz-logo.png','%73ite.js','site.js?x=1','api/news','favicon.ico']){
   const r=await fetch(url+p);assert.equal(r.status,404,p);assert.equal((await r.arrayBuffer()).byteLength,0);
  }
  const range=await fetch(url,{headers:{Range:'bytes=0-10'}});assert.equal(range.status,416);assert.equal((await range.arrayBuffer()).byteLength,0);
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  const post=await fetch(url,{method:'POST'});assert.equal(post.status,405);
  const foreign=await new Promise((resolve,reject)=>{http.get(url,{headers:{Host:'untrusted.example.org'}},r=>{r.resume();resolve(r.statusCode)}).on('error',reject)});assert.equal(foreign,403);
 }finally{await new Promise(r=>server.close(r))}
});
