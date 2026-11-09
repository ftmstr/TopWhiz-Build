import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createServer, request, type Server } from 'node:http';
import pg from 'pg';

// This is a disposable PG16 + loopback HTTP counterexample, NOT the production
// Cloudflare handler. It must remain a NEGATIVE release test, not an exposure fix.
const URI = process.env.TEST_DATABASE_URL;
if (!URI || !['127.0.0.1', 'localhost'].includes(new URL(URI).hostname))
  throw Error('TUR031 requires an explicit localhost disposable TEST_DATABASE_URL');
const DATA = Buffer.from('TOPWHIZ TUR031 original fictional bytes only. '.repeat(192), 'utf8');

test('TUR031: real PG16 revocation COMMIT cannot retract locally delivered HTTP bytes or paused receiver bytes', { timeout: 30000 }, async () => {
  const suffix = randomBytes(5).toString('hex');
  const schema = 'tw031_' + suffix;
  const roleNames = ['reader', 'revoker'].map(name => schema + '_' + name);
  const passwords = roleNames.map(() => randomBytes(20).toString('hex'));
  const admin = new pg.Client({ connectionString: URI });
  const sessions: pg.Client[] = [];
  let server: Server | undefined;
  let releaseAfterCommit = () => {};
  let markLastRead = () => {};
  let markBufferedWrite = () => {};
  let resumeReceiver = () => {};
  const lastRead = new Promise<void>(resolve => { markLastRead = resolve; });
  const postCommitGate = new Promise<void>(resolve => { releaseAfterCommit = resolve; });
  const bufferedWritten = new Promise<void>(resolve => { markBufferedWrite = resolve; });
  try {
    await admin.connect();
    for (let i = 0; i < roleNames.length; i++)
      await admin.query('CREATE ROLE ' + roleNames[i] +
        " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + passwords[i] + "'");
    await admin.query('CREATE SCHEMA ' + schema);
    await admin.query('CREATE TABLE ' + schema +
      '.rights (id int PRIMARY KEY, approved boolean NOT NULL, generation bigint NOT NULL CHECK (generation > 0))');
    await admin.query('INSERT INTO ' + schema + '.rights VALUES (1,true,1),(2,true,1)');
    await admin.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    for (const role of roleNames)
      await admin.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' + role);
    await admin.query('GRANT SELECT ON ' + schema + '.rights TO ' + roleNames[0]);
    await admin.query('GRANT SELECT(id), UPDATE(approved,generation) ON ' + schema + '.rights TO ' + roleNames[1]);
    for (let i = 0; i < roleNames.length; i++) {
      const url = new URL(URI);
      url.username = roleNames[i];
      url.password = passwords[i];
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      assert.equal((await client.query('SELECT session_user AS identity')).rows[0].identity, roleNames[i]);
      sessions.push(client);
    }
    const [reader, revoker] = sessions;
    await assert.rejects(reader.query('UPDATE ' + schema + '.rights SET approved=false WHERE id=1'), /permission denied/i);
    const queryRights = (id: number) => reader.query(
      'SELECT approved,generation FROM ' + schema + '.rights WHERE id=$1', [id]);
    const revoke = async (id: number) => {
      await revoker.query('BEGIN');
      try {
        const changed = await revoker.query('UPDATE ' + schema +
          '.rights SET approved=false,generation=generation+1 WHERE id=$1 AND approved=true', [id]);
        assert.equal(changed.rowCount, 1);
        await revoker.query('COMMIT');
      } catch (error) {
        await revoker.query('ROLLBACK');
        throw error;
      }
      assert.deepEqual((await queryRights(id)).rows[0], { approved: false, generation: '2' });
    };

    server = createServer(async (req, res) => {
      try {
        const path = req.url;
        const id = path === '/buffered' ? 2 : 1;
        const result = (await queryRights(id)).rows[0];
        if (!result?.approved) {
          res.writeHead(403, { 'cache-control': 'no-store' });
          res.end();
          return;
        }
        // A last good DB lookup does NOT authorize bytes after a later COMMIT.
        if (path === '/last-read') {
          markLastRead();
          await postCommitGate;
        }
        res.writeHead(200, { 'content-type': 'application/octet-stream',
          'content-length': DATA.length, 'cache-control': 'no-store' });
        res.end(DATA, () => { if (path === '/buffered') markBufferedWrite(); });
      } catch {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Expected TCP loopback HTTP port');
    const port = address.port;
    function call(path: string) {
      return new Promise<{ status: number | undefined; data: Buffer }>((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port, path }, res => {
          const parts: Buffer[] = [];
          res.on('data', chunk => parts.push(Buffer.from(chunk)));
          res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(parts) }));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      });
    }

    // Real COMMIT in a separate LOGIN while the illustrative handler is
    // deterministically suspended immediately after its final DB rights read.
    const late = call('/last-read');
    await lastRead;
    await revoke(1);
    releaseAfterCommit();
    const leaked = await late;
    assert.equal(leaked.status, 200);
    assert.deepEqual(leaked.data, DATA);
    const fresh = await call('/fresh-after-revoke');
    assert.equal(fresh.status, 403);
    assert.equal(fresh.data.length, 0);

    // This second result is about paused *receiver consumption* after COMMIT;
    // it does NOT establish when the last network byte crossed the wire.
    let markHeaders = () => {};
    const headersSeen = new Promise<void>(resolve => { markHeaders = resolve; });
    const delayedReceiver = new Promise<{ status: number | undefined; data: Buffer }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: '/buffered' }, res => {
        const chunks: Buffer[] = [];
        res.pause();
        resumeReceiver = () => res.resume();
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
        res.on('error', reject);
        markHeaders();
      });
      req.on('error', reject);
      req.end();
    });
    await headersSeen;
    await bufferedWritten;
    await revoke(2);
    resumeReceiver();
    const buffered = await delayedReceiver;
    assert.equal(buffered.status, 200);
    assert.deepEqual(buffered.data, DATA);
    const newRequest = await call('/buffered');
    assert.equal(newRequest.status, 403);
    assert.equal(newRequest.data.length, 0);

    console.log(JSON.stringify({
      suite: 'TUR031_REAL_PG16_LOOPBACK_HTTP_NEGATIVE',
      independentLoginRoles: 2, realPg16Commit: true,
      postFinalReadBytesAfterCommit: leaked.data.length,
      pausedReceiverBytesConsumedAfterCommit: buffered.data.length,
      sha256: createHash('sha256').update(DATA).digest('hex'),
      newlyAdmittedRequestDenied: true, cacheControlNoStoreInsufficient: true,
      syntheticServerNotProductionHandler: true, realR2: 'NOT_RUN',
      globalCdnPurge: 'NOT_PROVEN', actualLastWireByte: 'NOT_PROVEN',
      inheritedTUR018UnsafeBytes: 99276, release: 'NO_GO'
    }));
  } finally {
    releaseAfterCommit();
    resumeReceiver();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    for (const session of sessions) await session.end().catch(() => {});
    if ((admin as any)._connected) {
      await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
      for (const role of roleNames.reverse())
        await admin.query('DROP ROLE IF EXISTS ' + role).catch(() => {});
    }
    await admin.end().catch(() => {});
  }
});
