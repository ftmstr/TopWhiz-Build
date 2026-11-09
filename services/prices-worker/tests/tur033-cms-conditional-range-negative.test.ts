import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleCmsMedia } from '../src/cms/media-handler.mjs';
import { stageLicensedMedia } from '../src/cms/cloudflare-adapters.mjs';
import { makeSyntheticPng } from './fixtures/png-factory.mjs';

/** Actual CMS handler, fictional bytes and in-memory R2. This is NOT a CDN or wire-level proof. */
test('TUR033: Range and conditional requests cannot be mistaken for revocation fencing', async () => {
  const id = 'tur033-fictional-image';
  const bytes = Buffer.from(makeSyntheticPng(36, 32));
  const sha = createHash('sha256').update(bytes).digest('hex');
  const stored = new Map();
  const bucket = {
    async put(key, blob, metadata) { stored.set(key, { blob: Uint8Array.from(blob), metadata }); },
    async get(key) {
      const item = stored.get(key);
      return item ? { size: item.blob.length, body: new Response(item.blob).body,
        customMetadata: item.metadata.customMetadata, httpMetadata: item.metadata.httpMetadata } : null;
    }
  };
  const staged = await stageLicensedMedia(bucket, id, bytes, {
    rightsApproved: true, evidenceRef: 'CI_SYNTHETIC_ONLY', reviewer: 'CI fictional reviewer'
  });
  assert.equal(staged.sha256, sha);
  let approved = true;
  let lookups = 0;
  const findApprovedAsset = async requested => {
    lookups++;
    if (requested !== id || !approved) return null;
    return { id, key: staged.key, sha256Hex: sha, contentType: staged.contentType,
      bytes: staged.bytes, rightsApproved: true };
  };
  const url = 'https://cms.ci.invalid/v1/media/' + id;
  const cases = [
    { Range: 'bytes=0-0' },
    { Range: 'bytes=-1' },
    { 'If-None-Match': '"' + sha + '"' },
    { 'If-Modified-Since': 'Wed, 21 Oct 2099 07:28:00 GMT' },
    { 'If-Range': '"' + sha + '"', Range: 'bytes=0-4' }
  ];
  for (const headers of cases) {
    const response = await handleCmsMedia(new Request(url, { headers }), { findApprovedAsset, bucket });
    assert.equal(response.status, 200, 'No partial/304 delivery contract exists');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  assert.equal(lookups, cases.length * 2);
  approved = false;
  for (const headers of cases) {
    const response = await handleCmsMedia(new Request(url, { headers }), { findApprovedAsset, bucket });
    assert.equal(response.status, 404);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const head = await handleCmsMedia(new Request(url, { method: 'HEAD', headers: cases[0] }),
    { findApprovedAsset, bucket });
  assert.equal(head.status, 404);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  console.log(JSON.stringify({ suite: 'TUR033_CMS_RANGE_CONDITIONAL_NEGATIVE',
    syntheticBytes: bytes.length, cases: cases.length, postRevokeDenied: true,
    preRevokeFullResponse: true, finalWireByte: 'NOT_PROVEN',
    actualCDN: 'NOT_RUN', issue22: 'OPEN', release: 'NO_GO' }));
});
