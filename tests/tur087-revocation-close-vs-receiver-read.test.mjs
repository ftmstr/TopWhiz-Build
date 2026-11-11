import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {get} from 'node:http';
import {once} from 'node:events';

// Synthetic, intentionally isolated loopback HTTP; no production integration.
const source = [
  "",
  "const {createServer}=require('node:http');",
  "let revoked=false, generation=1; const held=new Set();",
  "const server=createServer((req,res)=>{",
  " if(req.url!=='/media'&&req.url!=='/completed'){res.writeHead(404);res.end();return;}",
  " if(revoked){res.writeHead(403,{'Cache-Control':'no-store'});res.end();return;}",
  " res.writeHead(200,{'Cache-Control':'no-store'});",
  " if(req.url==='/completed'){res.end('ABCDWXYZ',()=>process.send({type:'completed'}));return;}",
  " res.write('ABCD');held.add(res);res.once('close',()=>held.delete(res));",
  "});",
  "server.listen(0,'127.0.0.1',()=>process.send({type:'ready',port:server.address().port}));",
  "process.on('message',async m=>{",
  " if(m.type==='revoke'){",
  "  revoked=true;generation++;",
  "  await Promise.all([...held].map(res=>new Promise(done=>{res.once('close',done);res.destroy();})));",
  "  process.send({type:'revoked',generation,held:held.size});",
  " }",
  " if(m.type==='release'){",
  "  const count=held.size;for(const res of [...held])res.end('EFGH');",
  "  process.send({type:'released',count});",
  " }",
  " if(m.type==='shutdown'){server.closeAllConnections();server.close(()=>process.exit(0));}",
  "});"
].join('\n');
function wait(child,type){return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>finish(new Error('timeout '+type)),5000);
 function message(m){if(m?.type===type)finish(null,m);}
 function exit(code){finish(new Error('exit '+code+' before '+type));}
 function finish(err,v){clearTimeout(timer);child.off('message',message);child.off('exit',exit);err?reject(err):resolve(v);}
 child.on('message',message);child.once('exit',exit);
});}
async function start(){const child=spawn(process.execPath,['-e',source],{stdio:['ignore','ignore','pipe','ipc']});
 try{const {port}=await wait(child,'ready');return {child,port};}catch(e){child.kill('SIGKILL');throw e;}}
async function send(p,type,reply){const result=wait(p.child,reply);p.child.send({type});return result;}
async function withPublishers(n,fn){const ps=[];try{
 for(let i=0;i<n;i++)ps.push(await start());
 assert.equal(new Set(ps.map(p=>p.child.pid)).size,n);await fn(ps);
}finally{await Promise.all(ps.map(async p=>{
 const c=p.child;if(c.exitCode!==null||c.signalCode!==null)return;
 const exited=once(c,'exit').catch(()=>{});if(c.connected)c.send({type:'shutdown'});
 await Promise.race([exited,new Promise(r=>setTimeout(r,1000))]);
 if(c.exitCode===null&&c.signalCode===null)c.kill('SIGKILL');
}));}}
async function held(port){const r=await fetch('http://127.0.0.1:' + port + '/media');
 assert.equal(r.status,200);const reader=r.body.getReader();
 const first=await reader.read();assert.equal(Buffer.from(first.value).toString(),'ABCD');return reader;}

test('two independent publishers close held streams before revocation ACK', {timeout:12000},async()=>{
 await withPublishers(2,async ps=>{
  const readers=await Promise.all(ps.map(p=>held(p.port)));
  const acks=await Promise.all(ps.map(p=>send(p,'revoke','revoked')));
  for(const a of acks){assert.equal(a.generation,2);assert.equal(a.held,0);}
  const releases=await Promise.all(ps.map(p=>send(p,'release','released')));
  assert.deepEqual(releases.map(x=>x.count),[0,0]);
  for(const reader of readers){let next;try{next=await reader.read();}catch{next={done:true};}
   assert.equal(next.done,true,'no application tail after close barrier');}
  for(const p of ps){const r=await fetch('http://127.0.0.1:' + p.port + '/media');
   assert.equal(r.status,403);await r.arrayBuffer();}
 });
});

test('paused receiver can consume already-written bytes after revocation ACK', {timeout:12000},async()=>{
 await withPublishers(1,async([p])=>{
  const completed=wait(p.child,'completed');
  const response=await new Promise((resolve,reject)=>{
   const request=get('http://127.0.0.1:' + p.port + '/completed',resolve);request.once('error',reject);
  });
  assert.equal(response.statusCode,200);response.pause();await completed;
  const ack=await send(p,'revoke','revoked');assert.equal(ack.generation,2);
  const chunks=[];response.on('data',c=>chunks.push(c));const ended=once(response,'end');
  response.resume();await ended;assert.equal(Buffer.concat(chunks).toString(),'ABCDWXYZ');
  const fresh=await fetch('http://127.0.0.1:' + p.port + '/completed');
  assert.equal(fresh.status,403);await fresh.arrayBuffer();
 });
});
