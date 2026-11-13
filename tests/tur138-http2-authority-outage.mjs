import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { once } from 'node:events';

// Synthetic localhost experiment. NOT a remote CDN final-byte proof.
async function run(guarded) {
  let epoch=1, authorityAvailable=true, postAckBytes=0;
  const server=http2.createServer();
  server.on('stream',(stream,headers)=>{
    if(headers[':path']==='/health'){stream.respond({':status':200});stream.end('SIBLING_OK');return;}
    stream.respond({':status':200});
    stream.write('HEAD');
    setImmediate(()=>{
      epoch=2; // authoritative revocation ACK, synthetic only
      authorityAvailable=false; // fail-closed authority outage immediately after ACK
      const capturedEpoch=1;
      if(!guarded || (authorityAvailable && capturedEpoch===epoch)){
        stream.write('TAIL');postAckBytes+=4;
      }
      stream.end();
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const client=http2.connect('http://127.0.0.1:'+server.address().port);
  try{
    const media=client.request({':path':'/media'});media.setEncoding('utf8');
    let body='';media.on('data',chunk=>body+=chunk);await once(media,'end');
    const health=client.request({':path':'/health'});health.setEncoding('utf8');
    let sibling='';health.on('data',chunk=>sibling+=chunk);await once(health,'end');
    return {body,postAckBytes,sibling};
  }finally{client.close();await new Promise(resolve=>server.close(resolve));}
}
const unsafe=await run(false),guarded=await run(true);
assert.equal(unsafe.body,'HEADTAIL');assert.equal(unsafe.postAckBytes,4);
assert.equal(guarded.body,'HEAD');assert.equal(guarded.postAckBytes,0);
assert.equal(guarded.sibling,'SIBLING_OK');
console.log('TUR138_LOCAL_HTTP2_AUTHORITY_OUTAGE_REVOCATION_TAG 1/1 PASS; unsafe=4 guarded=0 sibling=SIBLING_OK; REMOTE_R2_CDN_NOT_PROVEN');
