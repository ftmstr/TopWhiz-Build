/**
 * TUR041: test-only fetch transport for the REAL Next.js production HTTP
 * server. Loads solely in an isolated CI process with localhost PG16.
 * The app's original Next GET, original CMS handler and original PNG verifier
 * remain unchanged. No real R2, external fetch, CDN or production IAM.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { handleCmsMedia } from '../services/prices-worker/src/cms/media-handler.mjs';
import { makeSyntheticPng } from '../services/prices-worker/tests/fixtures/png-factory.mjs';

if (process.env.TOPWHIZ_TUR041_REAL_NEXT_TEST === '1') {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const schema = process.env.TOPWHIZ_TUR041_SCHEMA;
  const username = process.env.TOPWHIZ_TUR041_READER;
  const password = process.env.TOPWHIZ_TUR041_PASSWORD;
  let parsedDatabaseUrl;
  try { parsedDatabaseUrl = new URL(databaseUrl); } catch { /* reject below */ }
  const safeDatabaseUrl = parsedDatabaseUrl?.protocol === 'postgresql:' &&
    ['127.0.0.1', 'localhost'].includes(parsedDatabaseUrl.hostname) &&
    !parsedDatabaseUrl.search && !parsedDatabaseUrl.hash &&
    (!parsedDatabaseUrl.port || parsedDatabaseUrl.port === '5432') &&
    true;
  if (process.env.CI !== 'true' ||
      process.env.TOPWHIZ_CMS_API_BASE !== 'https://cms.ci.invalid/' ||
      process.env.TOPWHIZ_CMS_API_HOST !== 'cms.ci.invalid' ||
      !safeDatabaseUrl ||
      !/^tw041_[a-f0-9]{10}$/.test(schema ?? '') ||
      !/^tw041_[a-f0-9]{10}_reader$/.test(username ?? '') ||
      !/^[a-f0-9]{36}$/.test(password ?? ''))
    throw Error('TUR041 test-only Next preload refused unsafe configuration');

  const requireService = createRequire(new URL('../services/prices-worker/package.json', import.meta.url));
  const { Pool } = requireService('pg');
  const url = new URL(databaseUrl);
  url.username = username;
  url.password = password;
  const pool = new Pool({ connectionString: url.href, max: 4 });
  const original = makeSyntheticPng(54, 44);
  const digest = createHash('sha256').update(original).digest('hex');
  const seen = new Map();
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  const bucket = {
    async get(key) {
      if (!new RegExp('^media/reviewed/tur041-[ab]/' + digest + '\\.png$').test(key))
        return null;
      return { size: original.length, body: new Response(original).body,
        customMetadata: { sha256: digest },
        httpMetadata: { contentType: 'image/png' } };
    }
  };
  async function findApprovedAsset(id) {
    if (!/^tur041-[ab]$/.test(id)) return null;
    const result = await pool.query('SELECT id,key,sha256_hex,content_type,bytes,approved,generation' +
      ' FROM ' + schema + '.media WHERE id=$1 AND approved=true', [id]);
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    if (count === 2 && result.rows.length === 1) {
      // SQL SELECT has returned an approved snapshot. Mark the test gate
      // using the independent READ login and wait for revoker's COMMIT.
      await pool.query('UPDATE ' + schema + '.gates SET arrived=true,final_count=2 WHERE id=$1', [id]);
      let released = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const status = await pool.query('SELECT released FROM ' + schema + '.gates WHERE id=$1', [id]);
        if (status.rows[0]?.released) { released = true; break; }
        await pause(20);
      }
      if (!released) throw Error('TUR041 final-read barrier timed out: fail closed');
    }
    const a = result.rows[0];
    return a ? {
      id: a.id, key: a.key, sha256Hex: a.sha256_hex,
      contentType: a.content_type, bytes: a.bytes, rightsApproved: a.approved
    } : null;
  }

  globalThis.fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    let uri;
    try { uri = new URL(raw); } catch { return nativeFetch(input, init); }
    if (uri.hostname !== 'cms.ci.invalid') return nativeFetch(input, init);
    if (uri.origin !== 'https://cms.ci.invalid' || uri.username || uri.password ||
        uri.port || uri.search || uri.hash || !/^\/v1\/media\/tur041-[ab]$/.test(uri.pathname))
      return new Response(null, { status: 404 });
    return handleCmsMedia(new Request(uri.href, { method: init?.method ?? 'GET' }),
      { findApprovedAsset, bucket });
  };
}
