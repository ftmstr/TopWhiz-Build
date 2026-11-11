import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import http2 from 'node:http2';
import { fileURLToPath } from 'node:url';

// TUR101 synthetic loopback h2c only. :authority is client-supplied; this
// does not model TLS SNI, ORIGIN frames or trusted reverse-proxy tenant routing.
const self = fileURLToPath(import.meta.url);
const secret = 'synthetic-tur101-tenant-hmac-key';
const kid = 'synthetic-tur101';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = payload => createHmac('sha256', secret).update(kid + '.' + payload).digest('base64url');
const payload = encode({tenant:'alpha.example.test',asset:'shared',epoch:1,exp:4102444800});
const grant = kid + '.' + payload + '.' + sign(payload);

if (process.argv.includes('--tur101-child')) {
  let epoch = 1, available = true;
  const cached = process.env.TUR101_CACHED === '1';
  const sessions = new WeakSet();
  const verify = (token, authority) => {
    if (!available) return false;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== kid) return false;
    const expected = Buffer.from(sign(parts[1]));
    const supplied = Buffer.from(parts[2]);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return claims.tenant === authority && claims.asset === 'shared' &&
        claims.epoch === epoch && claims.exp > Date.now() / 1000;
    } catch { return false; }
  };
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    const authority = headers[':authority'];
    const known = authority === 'alpha.example.test' || authority === 'beta.example.test';
    const token = String(headers.authorization || '').replace(/^Bearer /, '');
    const allowed = known && headers[':path'] === '/media/shared' &&
      ((cached && sessions.has(stream.session)) || verify(token, authority));
    if (!allowed) { stream.respond({':status':403}); stream.end(); return; }
    if (cached) sessions.add(stream.session);
    stream.respond({':status':200,'content-type':'application/octet-stream'});
    stream.end(authority === 'alpha.example.test' ? 'ALFA' : 'BETA');
  });
  process.on('message', message => {
    if (message?.cmd === 'revoke') { epoch = 2; process.send?.({id:message.id,ok:true}); }
    if (message?.cmd === 'outage') { available = false; process.send?.({id:message.id,ok:true}); }
    if (message?.cmd === 'close') {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 500).unref();
    }
  });
  server.listen(0, '127.0.0.1', () => process.send?.({ready:true,port:server.address().port}));
} else {
  let id = 0;
  async function publisher(cached) {
    const child = fork(self, ['--tur101-child'], {
      env:{...process.env,TUR101_CACHED:cached?'1':'0'},
      stdio:['ignore','ignore','inherit','ipc']
    });
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('startup timeout')), 5000);
      function ready(message) {
        if (message?.ready) { clearTimeout(timeout); child.off('message', ready); resolve(message.port); }
      }
      child.on('message', ready);
      child.once('exit', code => reject(Error('child exited ' + code)));
    });
    const command = cmd => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timeout = setTimeout(() => { child.off('message', reply); reject(Error(cmd + ' timeout')); }, 5000);
      function reply(message) {
        if (message?.id === requestId) { clearTimeout(timeout); child.off('message', reply); resolve(message); }
      }
      child.on('message', reply);
      child.send({cmd,id:requestId});
    });
    const close = async () => {
      if (child.exitCode !== null) return;
      child.send({cmd:'close'});
      await new Promise(resolve => {
        child.once('exit', resolve);
        setTimeout(() => { child.kill(); resolve(); }, 2000).unref();
      });
    };
    return {port,command,close};
  }
  function request(session, authority, token = grant) {
    return new Promise((resolve, reject) => {
      const stream = session.request({
        ':method':'GET', ':path':'/media/shared', ':authority':authority,
        authorization:'Bearer ' + token
      });
      let status, body = '';
      const timeout = setTimeout(() => { stream.close(); reject(Error('HTTP/2 timeout')); }, 5000);
      stream.on('response', headers => { status = headers[':status']; });
      stream.on('data', chunk => { body += chunk.toString(); });
      stream.on('end', () => { clearTimeout(timeout); resolve({status,body}); });
      stream.on('error', error => { clearTimeout(timeout); reject(error); });
    });
  }
  test('connection-level grant cache crosses tenant authority on second stream', {timeout:20000}, async () => {
    const p = await publisher(true), session = http2.connect('http://127.0.0.1:' + p.port);
    try {
      assert.deepEqual(await request(session, 'alpha.example.test'), {status:200,body:'ALFA'});
      assert.deepEqual(await request(session, 'beta.example.test'), {status:200,body:'BETA'});
    } finally { session.close(); await p.close(); }
  });
  test('per-stream grant-to-authority binding rejects cross-tenant access', {timeout:20000}, async () => {
    const p = await publisher(false), session = http2.connect('http://127.0.0.1:' + p.port);
    try {
      assert.deepEqual(await request(session, 'alpha.example.test'), {status:200,body:'ALFA'});
      assert.deepEqual(await request(session, 'beta.example.test'), {status:403,body:''});
      assert.deepEqual(await request(session, 'unknown.example.test'), {status:403,body:''});
    } finally { session.close(); await p.close(); }
  });
  test('revoke ACK leaves cached cross-tenant session alive; per-stream epoch fails closed', {timeout:20000}, async () => {
    for (const cached of [true, false]) {
      const p = await publisher(cached), session = http2.connect('http://127.0.0.1:' + p.port);
      try {
        assert.deepEqual(await request(session, 'alpha.example.test'), {status:200,body:'ALFA'});
        await p.command('revoke');
        assert.deepEqual(await request(session, 'beta.example.test'),
          cached ? {status:200,body:'BETA'} : {status:403,body:''});
        const fresh = http2.connect('http://127.0.0.1:' + p.port);
        try { assert.deepEqual(await request(fresh, 'alpha.example.test'), {status:403,body:''}); }
        finally { fresh.close(); }
      } finally { session.close(); await p.close(); }
    }
  });
  test('authority outage denies per-stream access on authorized connection', {timeout:20000}, async () => {
    const p = await publisher(false), session = http2.connect('http://127.0.0.1:' + p.port);
    try {
      assert.deepEqual(await request(session, 'alpha.example.test'), {status:200,body:'ALFA'});
      await p.command('outage');
      assert.deepEqual(await request(session, 'alpha.example.test'), {status:403,body:''});
    } finally { session.close(); await p.close(); }
  });
}
