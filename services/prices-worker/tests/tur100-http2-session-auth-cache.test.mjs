import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import http2 from 'node:http2';
import { fileURLToPath } from 'node:url';

// TUR100: synthetic local HTTP/2 authorization cache counterexamples.
// Neither local stream rejection nor a rotation ACK proves remote final-byte revocation.
const self = fileURLToPath(import.meta.url);
const key1 = 'synthetic-http2-session-epoch-one-key';
const key2 = 'synthetic-http2-session-epoch-two-key';
const kid = 'synthetic-tur100-kid';
const encode = claims => Buffer.from(JSON.stringify(claims)).toString('base64url');
const mac = (key, p) => createHmac('sha256', key).update(`${kid}.${p}`).digest('base64url');
const payload = encode({asset:'a', epoch:1, exp:4102444800});
const oldGrant = `${kid}.${payload}.${mac(key1,payload)}`;

if (process.argv.includes('--tur100-child')) {
  let epoch = 1, key = key1, available = true;
  const cached = process.env.TUR100_CACHE === '1';
  const trustedSessions = new WeakSet();
  const valid = (token, asset) => {
    if (!available) return false;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== kid) return false;
    const expected = Buffer.from(mac(key, parts[1]));
    const actual = Buffer.from(parts[2]);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return claims.asset === asset && claims.epoch === epoch && claims.exp > Date.now()/1000;
    } catch { return false; }
  };
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    const path = headers[':path'];
    const asset = path === '/media/a' ? 'a' : path === '/media/b' ? 'b' : null;
    const token = String(headers.authorization || '').replace(/^Bearer /, '');
    const allowed = asset && (cached && trustedSessions.has(stream.session) || valid(token, asset));
    if (!allowed) { stream.respond({':status':403}); stream.end(); return; }
    if (cached) trustedSessions.add(stream.session);
    stream.respond({':status':200,'content-type':'application/octet-stream'});
    stream.end(asset === 'a' ? 'ABCD' : 'WXYZ');
  });
  process.on('message', msg => {
    if (msg?.cmd === 'rotate') { epoch = 2; key = key2; process.send?.({id:msg.id,ok:true}); }
    if (msg?.cmd === 'unavailable') { available = false; process.send?.({id:msg.id,ok:true}); }
    if (msg?.cmd === 'close') { server.close(() => process.exit(0)); setTimeout(() => process.exit(0),500).unref(); }
  });
  server.listen(0, '127.0.0.1', () => process.send?.({ready:true,port:server.address().port}));
} else {
  let seq = 0;
  async function publisher(cached) {
    const child = fork(self, ['--tur100-child'], {env:{...process.env,TUR100_CACHE:cached?'1':'0'},stdio:['ignore','ignore','inherit','ipc']});
    const port = await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('publisher startup timeout')),5000);
      child.on('message', function ready(msg) { if(msg?.ready) {clearTimeout(timer);child.off('message',ready);resolve(msg.port);} });
      child.once('exit', code => reject(Error(`publisher exit ${code}`)));
    });
    const command = cmd => new Promise((resolve,reject) => {
      const id=++seq;
      const timer=setTimeout(()=>{child.off('message',reply);reject(Error(`${cmd} timeout`));},5000);
      function reply(msg) {if(msg?.id===id){clearTimeout(timer);child.off('message',reply);resolve(msg);}}
      child.on('message',reply); child.send({cmd,id});
    });
    const close = async () => {
      if(child.exitCode!==null) return;
      child.send({cmd:'close'});
      await new Promise(resolve => {child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},2000).unref();});
    };
    return {port,command,close};
  }
  async function request(session, path, grant=oldGrant) {
    return new Promise((resolve,reject) => {
      const stream=session.request({':method':'GET',':path':path,authorization:`Bearer ${grant}`});
      let status, body='';
      const timer=setTimeout(()=>{stream.close();reject(Error('HTTP/2 response timeout'));},5000);
      stream.on('response',headers => {status=headers[':status'];});
      stream.on('data',chunk => {body+=chunk.toString();});
      stream.on('end',()=>{clearTimeout(timer);resolve({status,body});});
      stream.on('error',err=>{clearTimeout(timer);reject(err);});
    });
  }
  test('cached HTTP/2 session reuses revoked epoch-1 authorization for a second stream',{timeout:20000},async()=>{
    const p=await publisher(true), session=http2.connect(`http://127.0.0.1:${p.port}`);
    try {
      assert.deepEqual(await request(session,'/media/a'),{status:200,body:'ABCD'});
      await p.command('rotate');
      assert.deepEqual(await request(session,'/media/a'),{status:200,body:'ABCD'});
      const fresh=http2.connect(`http://127.0.0.1:${p.port}`);
      try {assert.deepEqual(await request(fresh,'/media/a'),{status:403,body:''});} finally {fresh.close();}
    } finally {session.close();await p.close();}
  });
  test('per-stream epoch check denies revoked grant on a persistent HTTP/2 session',{timeout:20000},async()=>{
    const p=await publisher(false), session=http2.connect(`http://127.0.0.1:${p.port}`);
    try {
      assert.deepEqual(await request(session,'/media/a'),{status:200,body:'ABCD'});
      await p.command('rotate');
      assert.deepEqual(await request(session,'/media/a'),{status:403,body:''});
      const forged=encode({asset:'a',epoch:2,exp:4102444800});
      assert.deepEqual(await request(session,'/media/a',`${kid}.${forged}.${mac(key1,forged)}`),{status:403,body:''});
    } finally {session.close();await p.close();}
  });
  test('connection-level auth cache crosses asset scope; per-stream verifier rejects it',{timeout:20000},async()=>{
    for(const cached of [true,false]) {
      const p=await publisher(cached), session=http2.connect(`http://127.0.0.1:${p.port}`);
      try {
        assert.deepEqual(await request(session,'/media/a'),{status:200,body:'ABCD'});
        assert.deepEqual(await request(session,'/media/b'),cached?{status:200,body:'WXYZ'}:{status:403,body:''});
      } finally {session.close();await p.close();}
    }
  });
  test('per-stream verifier fails closed after local authority outage, even on authorized session',{timeout:20000},async()=>{
    const p=await publisher(false), session=http2.connect(`http://127.0.0.1:${p.port}`);
    try {
      assert.deepEqual(await request(session,'/media/a'),{status:200,body:'ABCD'});
      await p.command('unavailable');
      assert.deepEqual(await request(session,'/media/a'),{status:403,body:''});
    } finally {session.close();await p.close();}
  });
}
