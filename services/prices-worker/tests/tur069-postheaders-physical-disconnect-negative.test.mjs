import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';

function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function within(p,label){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timeout')),7000)})])}finally{clearTimeout(timer)}}

test('TUR069: physical disconnect after HTTP headers and first chunk cannot retract bytes; no receiver ACK', {timeout:20000},async()=>{
  const first=Buffer.from('FICTIONAL_FIRST_CHUNK_069');
  const second=Buffer.from('FICTIONAL_SECOND_CHUNK_069');
  const disconnected=gate();
  let generation=1,localQueued=0,serverFinished=false,closeBeforeFinish=false,clientBytes=0,ackCount=0,lateDenied=false;
  const server=http.createServer(async (_req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/octet-stream');
    res.once('finish',()=>{serverFinished=true});
    res.once('close',()=>{if(!res.writableFinished){closeBeforeFinish=true;disconnected.resolve()}});
    if(generation!==1){res.writeHead(404);res.end();return}
    res.writeHead(200);res.write(first);localQueued+=first.length;
    await disconnected.promise;
    generation=2; // independent revocation after first chunk is already observed
    if(generation!==1){lateDenied=true;return}
    res.write(second);localQueued+=second.length;res.end();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port;
  try{
    const seen=gate();
    const request=http.get({host:'127.0.0.1',port,path:'/fictional'},response=>{
      assert.equal(response.statusCode,200);
      response.once('data',chunk=>{clientBytes+=chunk.length;assert.deepEqual(chunk,first);seen.resolve();request.destroy()});
    });
    request.on('error',()=>{});
    await within(seen.promise,'first physical chunk');
    await within(disconnected.promise,'socket close');
    assert.equal(closeBeforeFinish,true);
    assert.equal(lateDenied,true);
    assert.equal(clientBytes,first.length);
    assert.equal(localQueued,first.length);
    assert.equal(serverFinished,false);
    assert.equal(ackCount,0);
    console.log(JSON.stringify({suite:'TUR069_POST_HEADERS_PHYSICAL_DISCONNECT',firstChunkReceived:clientBytes,secondChunkQueued:0,revocationAfterFirstChunk:true,serverFinish:false,receiverAck:'NOT_PROVEN',globalZeroLeak:'NOT_PROVEN',issue22:'OPEN',release:'NO_GO'}));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
