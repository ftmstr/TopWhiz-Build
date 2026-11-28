/** Real loopback HTTP transport, fictional payload; negative evidence only. */
import http from 'node:http';
import assert from 'node:assert/strict';
import {once} from 'node:events';
const payload=Buffer.alloc(4096,0x41),events=[];
let revoked=false,originFinish=false,buffered=null,receiverBytes=0;
const listen=async s=>{s.listen(0,'127.0.0.1');await once(s,'listening');return 'http://127.0.0.1:'+s.address().port+'/'};
const close=s=>new Promise(resolve=>s.close(resolve));
let release;const gate=new Promise(r=>{release=r});
let ready;const readyPromise=new Promise(r=>{ready=r});
const origin=http.createServer((_q,res)=>{
 if(revoked){res.writeHead(404);res.end();return}
 res.on('finish',()=>{originFinish=true;events.push('ORIGIN_FINISH')});
 res.writeHead(200,{'Content-Length':payload.length,'Cache-Control':'no-store'});res.end(payload);
});
const originUrl=await listen(origin);
const intermediary=http.createServer(async(_q,res)=>{
 try{
  const upstream=await fetch(originUrl);assert.equal(upstream.status,200);
  buffered=Buffer.from(await upstream.arrayBuffer());assert.deepEqual(buffered,payload);
  events.push('INTERMEDIARY_BUFFERED');ready();await gate;
  res.writeHead(200,{'Content-Length':buffered.length,'Cache-Control':'no-store'});res.end(buffered);
 }catch{res.destroy();ready()}
});
const url=await listen(intermediary);
try{
 const receipt=(async()=>{const r=await fetch(url);assert.equal(r.status,200);const body=Buffer.from(await r.arrayBuffer());receiverBytes=body.length;events.push('RECEIVER_COMPLETE');assert.deepEqual(body,payload);return body.length})();
 await readyPromise;assert.equal(originFinish,true);assert.equal(receiverBytes,0);assert.ok(buffered);
 revoked=true;events.push('WITHDRAWAL');
 const denied=await fetch(originUrl);assert.equal(denied.status,404);assert.equal((await denied.arrayBuffer()).byteLength,0);events.push('NEW_ORIGIN_REQUEST_DENIED');
 release();assert.equal(await receipt,4096);
 assert.ok(events.indexOf('ORIGIN_FINISH')<events.indexOf('WITHDRAWAL'));
 assert.ok(events.indexOf('WITHDRAWAL')<events.indexOf('RECEIVER_COMPLETE'));
 console.log(JSON.stringify({status:'NEGATIVE_EVIDENCE',transport:'local HTTP over TCP with explicit buffering intermediary',events,postWithdrawalReceiverBytes:receiverBytes,newRequestBytes:0,cloudflareR2CdnVerified:false,issue22:'OPEN'}));
}finally{release();await close(intermediary);await close(origin)}
