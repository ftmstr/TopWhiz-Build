import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import http2 from 'node:http2';
import { fileURLToPath } from 'node:url';

// TUR099: disposable local HTTP/2 only. KID reuse and cross-process stale
// key-cache counterexample; NOT a production R2/CDN revocation guarantee.
const self = fileURLToPath(import.meta.url);
const KID = 'synthetic-kid-reused';
const oldKey = 'synthetic-ep1-' + 'a'.repeat(48);
const newKey = 'synthetic-ep2-' + 'b'.repeat(48);
const payload = Buffer.from(JSON.stringify({asset:'synthetic-media-1',epoch:1,exp:4102444800})).toString('base64url');
function sign(key, p=payload){return createHmac('sha256',key).update(KID+'.'+p).digest('base64url')}
const oldGrant = `${KID}.${payload}.${sign(oldKey)}`;
function valid(grant,key,epoch,strict){
 const parts = grant.split('.');
 if(parts.length!==3||parts[0]!==KID)return false;
 const expected=Buffer.from(sign(key,parts[1]));
 const actual=Buffer.from(parts[2]);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;
 let claims;try{claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))}catch{return false}
 return claims.asset==='synthetic-media-1'&&claims.exp>Math.floor(Date.now()/1000)&&(!strict||claims.epoch===epoch);
}

if(process.argv.includes('--tur099-child')){
 let epoch=1,key=oldKey,strict=process.env.TUR099_STRICT==='1';
 const active=new Set();
 const server=http2.createServer();
 server.on('stream',(stream,headers)=>{
   if(headers[':path']!=='/media'||!valid(String(headers.authorization||'').replace(/^Bearer /,''),key,epoch,strict)){
     stream.respond({':status':403});stream.end();return;
   }
   active.add(stream);stream.on('close',()=>active.delete(stream));
   stream.respond({':status':200,'content-type':'application/octet-stream'});
   stream.write('ABCD');
 });
 process.on('message',m=>{
   if(m?.cmd==='rotate'){
     epoch=2;key=newKey;
     if(strict){for(const s of active){if(!s.closed&&!s.destroyed)s.close(http2.constants.NGHTTP2_CANCEL)}}
     process.send?.({id:m.id,ok:true,epoch});
   }else if(m?.cmd==='tail'){
     let written=0;
     for(const s of active){if(!s.closed&&!s.destroyed){s.write('EFGHIJKL');s.end();written++}}
     process.send?.({id:m.id,ok:true,written});
   }else if(m?.cmd==='close'){
     for(const s of active){try{s.close(http2.constants.NGHTTP2_CANCEL)}catch{}}
     server.close(()=>process.exit(0));
     setTimeout(()=>process.exit(0),500).unref();
   }
 });
 server.listen(0,'127.0.0.1',()=>process.send?.({ready:true,port:server.address().port}));
}else{
 let seq=0;
 async function publisher(strict){
   const child=fork(self,['--tur099-child'],{env:{...process.env,TUR099_STRICT:strict?'1':'0'},stdio:['ignore','ignore','inherit','ipc']});
   const waitReady=new Promise((resolve,reject)=>{
     const timeout=setTimeout(()=>reject(Error('child startup timeout')),5000);
     const onMsg=m=>{if(m?.ready){clearTimeout(timeout);child.off('message',onMsg);resolve(m.port)}};
     child.on('message',onMsg);child.once('exit',code=>reject(Error('child exited '+code)));
   });
   const port=await waitReady;
   const command=cmd=>new Promise((resolve,reject)=>{
     const id=++seq;
     const timeout=setTimeout(()=>{child.off('message',onMsg);reject(Error(cmd+' timeout'))},5000);
     function onMsg(m){if(m?.id===id){clearTimeout(timeout);child.off('message',onMsg);resolve(m)}}
     child.on('message',onMsg);child.send({cmd,id});
   });
   const close=async()=>{if(child.exitCode!==null)return;child.send({cmd:'close'});await new Promise(r=>{child.once('exit',r);setTimeout(()=>{child.kill();r()},2000).unref()})};
   return {port,command,close};
 }
 function request(port,grant=oldGrant){
   const session=http2.connect(`http://127.0.0.1:${port}`);
   const stream=session.request({':path':'/media',':method':'GET',authorization:'Bearer '+grant});
   let status=0,body='';
   const first=new Promise((resolve,reject)=>{
     stream.on('response',h=>{status=h[':status'];if(status===403)resolve();});
     stream.on('data',chunk=>{body+=chunk.toString();if(body.length>=4)resolve()});
     stream.on('error',reject);
   });
   const done=new Promise(resolve=>{stream.on('close',()=>{session.close();resolve()});stream.on('error',()=>{session.close();resolve()})});
   return {first,done,get body(){return body},get status(){return status},session,stream};
 }
 test('stale sibling process accepts old HMAC under reused kid after other publisher revokes',{timeout:20000},async()=>{
   const fresh=await publisher(true),stale=await publisher(false);
   try{
     const receiver=request(stale.port);await receiver.first;
     assert.equal(receiver.status,200);assert.equal(receiver.body,'ABCD');
     await fresh.command('rotate'); // independent publisher acknowledged revocation
     const tail=await stale.command('tail');
     await receiver.done;
     assert.equal(tail.written,1);
     assert.equal(receiver.body,'ABCDEFGHIJKL');
     assert.equal(receiver.body.slice(4).length,8);
   }finally{await Promise.all([fresh.close(),stale.close()])}
 });
 test('epoch-aware key rotation rejects reused kid and closes existing HTTP2 stream before tail',{timeout:20000},async()=>{
   const guarded=await publisher(true);
   try{
     const receiver=request(guarded.port);await receiver.first;
     assert.equal(receiver.body,'ABCD');
     await guarded.command('rotate');
     await receiver.done;
     const tail=await guarded.command('tail');
     assert.equal(tail.written,0);assert.equal(receiver.body,'ABCD');
     const replay=request(guarded.port);await replay.first;await replay.done;
     assert.equal(replay.status,403);
   }finally{await guarded.close()}
 });
 test('old kid token cannot authenticate under new key even when epoch field is forged',{timeout:20000},async()=>{
   const guarded=await publisher(true);
   try{
     await guarded.command('rotate');
     const forgedPayload=Buffer.from(JSON.stringify({asset:'synthetic-media-1',epoch:2,exp:4102444800})).toString('base64url');
     const forged=`${KID}.${forgedPayload}.${sign(oldKey,forgedPayload)}`;
     const receiver=request(guarded.port,forged);await receiver.first;await receiver.done;
     assert.equal(receiver.status,403);
   }finally{await guarded.close()}
 });
}
