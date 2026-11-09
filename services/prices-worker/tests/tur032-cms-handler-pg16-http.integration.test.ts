import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import pg from 'pg';
import { handleCmsMedia } from '../src/cms/media-handler.mjs';
import { stageLicensedMedia } from '../src/cms/cloudflare-adapters.mjs';
import { makeSyntheticPng } from './fixtures/png-factory.mjs';

/**
 * TUR032 - Real production CMS media handler, real disposable PostgreSQL 16
 * independent LOGIN sessions, and actual localhost HTTP transport.
 * The bucket is an in-memory ORIGINAL synthetic R2 substitute: NOT live R2,
 * CDN, actual user content or a proof about the final byte on the wire.
 */
const URI = process.env.TEST_DATABASE_URL;
if (!URI || !['127.0.0.1', 'localhost'].includes(new URL(URI).hostname))
  throw Error('TUR032 requires explicit disposable localhost TEST_DATABASE_URL');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

test('TUR032 real CMS handler: committed PG16 withdrawal after final read / Response creation still delivers fictional bytes', { timeout: 30000 }, async () => {
  const suffix = randomBytes(5).toString('hex');
  const schema = 'tw032_' + suffix;
  const roles = ['reader', 'revoker'].map(name => schema + '_' + name);
  const secrets = roles.map(() => randomBytes(18).toString('hex'));
  const ids = ['tur032-final-check', 'tur032-response-held'];
  const fixture = makeSyntheticPng(54, 44);
  const bytes = Buffer.from(fixture);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const stored = new Map<string, { bytes: Uint8Array; metadata: any }>();
  const bucket = {
    async put(key: string, blob: Uint8Array, metadata: any) {
      stored.set(key, { bytes: Uint8Array.from(blob), metadata });
    },
    async get(key: string) {
      const item = stored.get(key);
      if (!item) return null;
      return {
        size: item.bytes.length,
        body: new Response(item.bytes).body,
        customMetadata: item.metadata.customMetadata,
        httpMetadata: item.metadata.httpMetadata
      };
    }
  };

  const finalLookupDone = deferred();
  const releaseFinalLookup = deferred();
  const handlerResponseReady = deferred();
  const releaseHttpOutput = deferred();
  let finalPaused = false;
  let outputPaused = false;
  const lookupCounts = new Map<string, number>();
  const admin = new pg.Client({ connectionString: URI });
  const clients: pg.Client[] = [];
  let server: Server | undefined;
  let adminConnected = false;

  try {
    await admin.connect();
    adminConnected = true;
    for (let i = 0; i < roles.length; i++) {
      await admin.query('CREATE ROLE ' + roles[i] +
        " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + secrets[i] + "'");
    }
    await admin.query('CREATE SCHEMA ' + schema);
    await admin.query('CREATE TABLE ' + schema + '.media (' +
      'id text PRIMARY KEY,key text NOT NULL,sha256_hex text NOT NULL,' +
      'content_type text NOT NULL,bytes int NOT NULL,approved boolean NOT NULL,' +
      'generation bigint NOT NULL CHECK (generation>0))');
    await admin.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    for (const role of roles) await admin.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' + role);
    await admin.query('GRANT SELECT ON ' + schema + '.media TO ' + roles[0]);
    await admin.query('GRANT SELECT(id,approved,generation), UPDATE(approved,generation) ON ' + schema + '.media TO ' + roles[1]);

    for (const id of ids) {
      const saved = await stageLicensedMedia(bucket, id, fixture, {
        rightsApproved: true, evidenceRef: 'CI_ORIGINAL_SYNTHETIC_ONLY',
        reviewer: 'Independent CI Fictional Reviewer'
      });
      assert.equal(saved.sha256, sha);
      await admin.query('INSERT INTO ' + schema +
        '.media (id,key,sha256_hex,content_type,bytes,approved,generation)' +
        ' VALUES ($1,$2,$3,$4,$5,true,1)',
        [id, saved.key, saved.sha256, saved.contentType, saved.bytes]);
    }
    for (let i = 0; i < roles.length; i++) {
      const url = new URL(URI);
      url.username = roles[i];
      url.password = secrets[i];
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      assert.equal((await client.query('SELECT session_user AS actor')).rows[0].actor, roles[i]);
      clients.push(client);
    }
    const [reader, revoker] = clients;
    await assert.rejects(reader.query('UPDATE ' + schema + '.media SET approved=false WHERE id=$1', [ids[0]]), /permission denied/i);

    async function findApprovedAsset(id: string) {
      const rows = (await reader.query('SELECT id,key,sha256_hex,content_type,bytes,approved,generation FROM ' +
        schema + '.media WHERE id=$1 AND approved=true', [id])).rows;
      const ordinal = (lookupCounts.get(id) ?? 0) + 1;
      lookupCounts.set(id, ordinal);
      if (id === ids[0] && ordinal === 2 && !finalPaused) {
        finalPaused = true;
        // SQL result is already read and held while another LOGIN commits.
        finalLookupDone.resolve();
        await releaseFinalLookup.promise;
      }
      const row = rows[0];
      return row ? {
        id: row.id, key: row.key, sha256Hex: row.sha256_hex,
        contentType: row.content_type, bytes: row.bytes,
        rightsApproved: row.approved
      } : null;
    }

    async function revoke(id: string) {
      await revoker.query('BEGIN');
      try {
        const change = await revoker.query('UPDATE ' + schema +
          '.media SET approved=false,generation=generation+1 WHERE id=$1 AND approved=true AND generation=1', [id]);
        assert.equal(change.rowCount, 1);
        await revoker.query('COMMIT');
      } catch (error) {
        await revoker.query('ROLLBACK').catch(() => {});
        throw error;
      }
      assert.deepEqual((await reader.query('SELECT approved,generation FROM ' +
        schema + '.media WHERE id=$1', [id])).rows[0],
        { approved: false, generation: '2' });
    }

    server = createServer(async (incoming, outgoing) => {
      try {
        const id = (incoming.url ?? '').split('/').pop();
        const response = await handleCmsMedia(
          new Request('https://cms.ci.invalid' + incoming.url, { method: incoming.method }),
          { findApprovedAsset, bucket }
        );
        // This gate is AFTER the actual handleCmsMedia final DB query,
        // PNG structural validation, SHA-256 verification and Response creation.
        if (id === ids[1] && response.status === 200 && !outputPaused) {
          outputPaused = true;
          handlerResponseReady.resolve();
          await releaseHttpOutput.promise;
        }
        const body = Buffer.from(await response.arrayBuffer());
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(body);
      } catch {
        if (!outgoing.headersSent) outgoing.writeHead(503, { 'cache-control': 'no-store' });
        outgoing.end();
      }
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Expected localhost TCP port');
    const origin = 'http://127.0.0.1:' + address.port;

    async function requestMedia(id: string, method = 'GET') {
      const response = await fetch(origin + '/v1/media/' + id, {
        method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000)
      });
      return {
        status: response.status,
        cache: response.headers.get('cache-control'),
        body: Buffer.from(await response.arrayBuffer())
      };
    }

    const afterRead = requestMedia(ids[0]);
    await finalLookupDone.promise;
    await revoke(ids[0]);
    releaseFinalLookup.resolve();
    const stale = await afterRead;
    assert.equal(stale.status, 200);
    assert.equal(stale.cache, 'no-store');
    assert.deepEqual(stale.body, bytes);
    assert.equal(lookupCounts.get(ids[0]), 2);
    const fresh = await requestMedia(ids[0]);
    assert.equal(fresh.status, 404);
    assert.equal(fresh.body.length, 0);
    const head = await requestMedia(ids[0], 'HEAD');
    assert.equal(head.status, 404);
    assert.equal(head.body.length, 0);

    const constructed = requestMedia(ids[1]);
    await handlerResponseReady.promise;
    assert.equal(lookupCounts.get(ids[1]), 2);
    await revoke(ids[1]);
    releaseHttpOutput.resolve();
    const oldResponse = await constructed;
    assert.equal(oldResponse.status, 200);
    assert.deepEqual(oldResponse.body, bytes);
    assert.equal(oldResponse.cache, 'no-store');
    const blocked = await requestMedia(ids[1]);
    assert.equal(blocked.status, 404);
    assert.equal(blocked.body.length, 0);

    console.log(JSON.stringify({
      suite: 'TUR032_ACTUAL_CMS_HANDLER_PG16_HTTP_NEGATIVE',
      cmsHandlerModule: 'services/prices-worker/src/cms/media-handler.mjs',
      realPostgres16: true, independentPasswordLogins: 2,
      structuralPngSha256Verified: true, fixtureSha256: sha,
      bytesAfterFinalDbReadThenCommit: stale.body.length,
      bytesAfterHandlerResponseCreatedThenCommit: oldResponse.body.length,
      freshPostCommitGetAndHeadDenied: true,
      noStoreCannotRetract: true, originalR2Substitute: true,
      realR2: 'NOT_RUN', nextProxyE2E: 'NOT_RUN',
      realCdnPurge: 'NOT_RUN', lastWireByteAfterRevoke: 'NOT_PROVEN',
      originalTUR018UnmitigatedBytes: 99276, release: 'NO_GO'
    }));
  } finally {
    releaseFinalLookup.resolve();
    releaseHttpOutput.resolve();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    for (const client of clients) await client.end().catch(() => {});
    if (adminConnected) {
      await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
      for (const role of roles.reverse()) await admin.query('DROP ROLE IF EXISTS ' + role).catch(() => {});
    }
    await admin.end().catch(() => {});
  }
});
