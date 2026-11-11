# TOPWHIZ TUR086 — Technical Report (2026-11-11)

## Scope and lineage
Stacked on TUR085 Draft PR #91 final HEAD `30a608710e7772826e4828cdb7cde74f32cd025e`; TUR085 first-page PR-triggered GitHub Actions 20/20 SUCCESS, including dedicated run 42992367386. This is **not** a release clearance. New branch `feat/tur086-cross-process-inflight-revocation-ack-20261111`.

## Distinct adversarial boundary
Unlike TUR083/TUR085's *unnotified stale publisher*, this TUR tests a publisher that **has acknowledged generation-2 revocation**, denies all NEW requests, but still has an existing generation-1 HTTP response. Two independent Node.js child processes, distinct PIDs, loopback HTTP servers, explicit IPC barriers and WHATWG Fetch stream readers reproduce the post-ACK tail. The unsafe fictional publisher intentionally omits cancellation of held responses.

- Case A: publisher B opens one stream and sends `ABCD` before revocation; both A and B ACK generation 2; fresh GETs on both return HTTP 403; B nevertheless releases `EFGH` (4 **new** bytes) to the existing stream **after** both ACKs.
- Case B: two simultaneous held B streams; both publishers ACK generation 2; B releases `EFGH` on each stream (8 **new** bytes after ACK).
- Test uses only synthetic ASCII bytes, 127.0.0.1, Node.js built-ins and native fetch; no production path, no external network, no R2, CDN, Queue, database, merchant or media asset. New code does **not** implement a mitigation.
- Local test command `node --test tests/tur086-cross-process-inflight-revoke-ack.test.mjs`: 2/2 PASS in isolated development execution before GitHub commit. GitHub Actions must be checked on **final report commit**; prior run success does not establish this TUR's CI acceptance.

## Interpretation
IPC ACK means local state was updated, not that existing response streams were canceled, remote receiver delivery stopped, cache entries invalidated or final network byte fenced. No zero-post-revocation-byte guarantee is claimed. Issue #22 OPEN / NO-GO. Do not infer actual customer exposure.

## Retained gates
TUR018 12 synthetic interleavings / 99,276 fictional post-withdrawal bytes; TUR019 cross-isolate bypass; PostgreSQL16 independent IAM/SECURITY DEFINER/schema-owner/CREATE ACL; immutable original outbox SHA/route allowlist; parallel broker/Queue/DLQ ambiguous COMMIT and lease; local vinext/workerd stale cache; real local Chromium accessibility/SEO/performance; TUR002 frozen pnpm; AGPL/LGPL libvips; source rights, trademark TOPWHIZ/TOPWIZ and independent operator approval.

No main merge, live Preview/deploy/Cloudflare R2/Queue/CDN/cache purge, Neon/prod DB, DNS, actual content/media/prices/merchant feed or AdSense. **Release NO-GO.**
