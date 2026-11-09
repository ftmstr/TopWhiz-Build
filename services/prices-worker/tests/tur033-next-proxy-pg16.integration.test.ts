import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { request as httpRequest, createServer, type Server } from 'node:http';
import pg from 'pg';
import { handleCmsMedia } from '../src/cms/media-handler.mjs';
import { stageLicensedMedia } from '../src/cms/cloudflare-adapters.mjs';
import { makeSyntheticPng } from './fixtures/png-factory.mjs';
// IMPORT THE EXISTING NEXT.JS APP ROUTER GET FUNCTION, NOT A RECREATION.
import { GET as nextMediaGET } from '../../../apps/web/app/media/cms/[id]/route.ts';

/**
 * TUR033: real CMS handler + real Next App Route GET, real disposable PG16
 * independently authenticated roles, and localhost HTTP reader. Only the
 * remote CMS fetch/R2 bindings are in-memory synthetic, with no live network.
 * Importing GET does NOT start a full Next.js server nor prove CDN delivery.
 */
const URI = process.env.TEST_DATABASE_URL;
if (!URI || !['127.0.0.1', 'localhost'].includes(new URL(URI).hostname))
  throw Error('TUR033 requires explicit disposable localhost TEST_DATABASE_URL');

function gate() {
  let open!: () => void;
  const waiting = new Promise<void>(r => { open = r; });
  return { waiting, open };
}

test('TUR033 actual CMS + Next proxy: PG16 rights COMMIT cannot retract preapproved response across local HTTP', { timeout: 45000 }, async () => {
  const suffix = randomBytes(5).toString('hex');
  const schema = 'tw033_' + suffix;
  const names = ['reader', 'revoker'].map(x => schema + '_' + x);
  const passwords = names.map(() => randomBytes(18).toString('hex'));
  const ids = ['tur033-before-final-result', 'tur033-after-proxy-created'];
  const original = makeSyntheticPng(54, 44);
  const expected = Buffer.from(original);
  const digest = createHash('sha256').update(expected).digest('hex');
  const objects = new Map<string, { bytes: Uint8Array; metadata: any }>();
  const bucket = {
    async put(key: string, bytes: Uint8Array, metadata: any) {
      objects.set(key, { bytes: Uint8Array.from(bytes), metadata });
    },
    async get(key: string) {
      const item = objects.get(key);
      return item ? {
        size: item.bytes.length, body: new Response(item.bytes).body,
        httpMetadata: item.metadata.httpMetadata,
        customMetadata: item.metadata.customMetadata
      } : null;
    }
  };
  const finalLookupCompleted = gate();
  const allowFinalLookupReturn = gate();
  const proxyResponseCreated = gate();
  const allowProxyNetworkWrite = gate();
  const counts = new Map<string, number>();
  const calls: string[] = [];
  const admin = new pg.Client({ connectionString: URI });
  const clients: pg.Client[] = [];
  const oldFetch = globalThis.fetch;
  const oldOrigin = process.env.TOPWHIZ_CMS_API_BASE;
  const oldHost = process.env.TOPWHIZ_CMS_API_HOST;
  let adminConnected = false;
  let server: Server | undefined;
  let firstPaused = false;
  let secondPaused = false;

  try {
    await admin.connect();
    adminConnected = true;
    for (let i = 0; i < names.length; i++)
      await admin.query('CREATE ROLE ' + names[i] +
        " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + passwords[i] + "'");
    await admin.query('CREATE SCHEMA ' + schema);
    await admin.query('CREATE TABLE ' + schema +
      '.media (id text PRIMARY KEY,key text NOT NULL,sha256_hex text NOT NULL,' +
      'content_type text NOT NULL,bytes int NOT NULL,approved boolean NOT NULL,' +
      'generation bigint NOT NULL CHECK (generation > 0))');
    await admin.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC');
    for (const name of names) await admin.query('GRANT USAGE ON SCHEMA ' + schema + ' TO ' + name);
    await admin.query('GRANT SELECT ON ' + schema + '.media TO ' + names[0]);
    await admin.query('GRANT SELECT(id,approved,generation), UPDATE(approved,generation) ON ' +
      schema + '.media TO ' + names[1]);
    for (const id of ids) {
      const receipt = await stageLicensedMedia(bucket, id, original, {
        rightsApproved: true, evidenceRef: 'CI_ORIGINAL_NO_REAL_MEDIA',
        reviewer: 'Synthetic CI Reviewer'
      });
      assert.equal(receipt.sha256, digest);
      await admin.query('INSERT INTO ' + schema +
        '.media (id,key,sha256_hex,content_type,bytes,approved,generation)' +
        ' VALUES ($1,$2,$3,$4,$5,true,1)',
        [id, receipt.key, receipt.sha256, receipt.contentType, receipt.bytes]);
    }
    for (let i = 0; i < names.length; i++) {
      const url = new URL(URI);
      url.username = names[i]; url.password = passwords[i];
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      assert.equal((await client.query('SELECT session_user AS logged_in')).rows[0].logged_in, names[i]);
      clients.push(client);
    }
    const [reader, revoker] = clients;
    await assert.rejects(reader.query('UPDATE ' + schema + '.media SET approved=false WHERE id=$1', [ids[0]]), /permission denied/i);
    async function findApprovedAsset(id: string) {
      const rows = (await reader.query('SELECT id,key,sha256_hex,content_type,bytes,approved,generation' +
        ' FROM ' + schema + '.media WHERE id=$1 AND approved=true', [id])).rows;
      const n = (counts.get(id) ?? 0) + 1;
      counts.set(id, n);
      if (id === ids[0] && n === 2 && !firstPaused) {
        firstPaused = true;
        finalLookupCompleted.open(); // After SQL SELECT, before returning to real CMS handler
        await allowFinalLookupReturn.waiting;
      }
      const a = rows[0];
      return a ? {
        id: a.id, key: a.key, sha256Hex: a.sha256_hex,
        contentType: a.content_type, bytes: a.bytes, rightsApproved: a.approved
      } : null;
    }
    async function withdraw(id: string) {
      await revoker.query('BEGIN');
      try {
        const changed = await revoker.query('UPDATE ' + schema +
          '.media SET approved=false,generation=generation+1' +
          ' WHERE id=$1 AND approved=true AND generation=1', [id]);
        assert.equal(changed.rowCount, 1);
        await revoker.query('COMMIT');
      } catch (error) {
        await revoker.query('ROLLBACK').catch(() => {});
        throw error;
      }
      assert.deepEqual((await reader.query('SELECT approved,generation FROM ' +
        schema + '.media WHERE id=$1', [id])).rows[0],
        { approved: false, generation: '2' });
    }

    // No external HTTPS call: intercepted exactly for an approved dummy CMS host.
    process.env.TOPWHIZ_CMS_API_BASE = 'https://cms.ci.invalid/';
    process.env.TOPWHIZ_CMS_API_HOST = 'cms.ci.invalid';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      assert.match(url, /^https:\/\/cms\.ci\.invalid\/v1\/media\/tur033-[a-z0-9-]+$/);
      assert.equal(init?.method, 'GET');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.cache, 'no-store');
      return handleCmsMedia(new Request(url), { findApprovedAsset, bucket });
    }) as typeof fetch;

    server = createServer(async (incoming, outgoing) => {
      try {
        const id = (incoming.url ?? '').split('/').pop() ?? '';
        const response = await nextMediaGET(
          new Request('http://127.0.0.1/media/cms/' + id) as any,
          { params: Promise.resolve({ id }) }
        );
        // This gate is AFTER the *actual* Next App Route GET has constructed
        // its Response, but BEFORE the local HTTP server begins output.
        if (id === ids[1] && response.status === 200 && !secondPaused) {
          secondPaused = true;
          proxyResponseCreated.open();
          await allowProxyNetworkWrite.waiting;
        }
        const data = Buffer.from(await response.arrayBuffer());
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(data);
      } catch {
        if (!outgoing.headersSent) outgoing.writeHead(503, { 'cache-control': 'no-store' });
        outgoing.end();
      }
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Expected loopback address');

    function get(path: string) {
      return new Promise<{ status: number | undefined; bytes: Buffer; cache: string | undefined }>((resolve, reject) => {
        const req = httpRequest({
          hostname: '127.0.0.1', port: address.port, path, method: 'GET'
        }, res => {
          const chunks: Buffer[] = [];
          res.on('data', chunk => chunks.push(Buffer.from(chunk)));
          res.on('end', () => resolve({
            status: res.statusCode, bytes: Buffer.concat(chunks),
            cache: res.headers['cache-control'] as string | undefined
          }));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      });
    }

    const early = get('/media/cms/' + ids[0]);
    await finalLookupCompleted.waiting;
    assert.equal(counts.get(ids[0]), 2);
    await withdraw(ids[0]); // Durably committed while handler holds approved snapshot
    allowFinalLookupReturn.open();
    const accepted = await early;
    assert.equal(accepted.status, 200);
    assert.equal(accepted.cache, 'no-store');
    assert.deepEqual(accepted.bytes, expected);
    const fresh = await get('/media/cms/' + ids[0]);
    assert.equal(fresh.status, 404);
    assert.equal(fresh.bytes.length, 0);

    const held = get('/media/cms/' + ids[1]);
    await proxyResponseCreated.waiting;
    assert.equal(counts.get(ids[1]), 2);
    await withdraw(ids[1]);
    allowProxyNetworkWrite.open();
    const old = await held;
    assert.equal(old.status, 200);
    assert.equal(old.cache, 'no-store');
    assert.deepEqual(old.bytes, expected);
    const fresh2 = await get('/media/cms/' + ids[1]);
    assert.equal(fresh2.status, 404);
    assert.equal(fresh2.bytes.length, 0);

    const beforeBad = calls.length;
    const bad = await get('/media/cms/bad.id');
    assert.equal(bad.status, 404);
    assert.equal(bad.bytes.length, 0);
    assert.equal(calls.length, beforeBad, 'invalid ID must not invoke upstream CMS');

    console.log(JSON.stringify({
      suite: 'TUR033_ACTUAL_CMS_NEXT_PROXY_PG16_HTTP_NEGATIVE',
      actualCmsHandler: true, actualNextGetFunction: true,
      fullNextServer: 'NOT_RUN', actualCloudflare: 'NOT_RUN',
      realDisposablePg16: true, independentPasswordLogins: 2,
      originalPngSha256: digest, mediaValidatedByCms: true,
      bytesAfterFinalSqlSnapshotAndCommit: accepted.bytes.length,
      bytesAfterNextProxyResponseAndCommit: old.bytes.length,
      newPostCommitRequestsDenied: true,
      invalidIdNoUpstream: true, noStoreCannotRetract: true,
      realR2: 'NOT_RUN', globalCdnPurge: 'NOT_RUN',
      lastNetworkByteAck: 'NOT_PROVEN', ownerIndependentIam: 'NOT_IMPLEMENTED',
      tur018UnsafeFictionalBytes: 99276, release: 'NO_GO'
    }));
  } finally {
    allowFinalLookupReturn.open();
    allowProxyNetworkWrite.open();
    globalThis.fetch = oldFetch;
    if (oldOrigin === undefined) delete process.env.TOPWHIZ_CMS_API_BASE;
    else process.env.TOPWHIZ_CMS_API_BASE = oldOrigin;
    if (oldHost === undefined) delete process.env.TOPWHIZ_CMS_API_HOST;
    else process.env.TOPWHIZ_CMS_API_HOST = oldHost;
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    for (const client of clients) await client.end().catch(() => {});
    if (adminConnected) {
      await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
      for (const name of names.reverse()) await admin.query('DROP ROLE IF EXISTS ' + name).catch(() => {});
    }
    await admin.end().catch(() => {});
  }
});
