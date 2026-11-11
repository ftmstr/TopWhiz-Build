# TOPWHIZ TUR089 — Technical Report (2026-11-11)

## Verified lineage and scope
Direct stacked parent: TUR088 Draft PR #94 HEAD `ec6a4aad86273e233857cef2a8d91094b6e2f1b1`. Its 20 accessible PR-triggered GitHub Actions workflow runs were all completed SUCCESS, including dedicated TUR088 run `43016415108`. REST PR listing showed latest #94, so TUR089 was not already present at creation. This is not production approval.

## Distinct adversarial contribution
Unlike TUR088's two multiplexed streams in a **single** process, TUR089 runs **two independent Node.js child processes** with separate HTTP/2 servers, in-memory revocation states and loopback ports. Parent/child IPC coordinates commands and ACKs; actual HTTP/2 clients observe responses.

1. Negative: publisher A revokes, emits GOAWAY, and the A client observes GOAWAY; publisher B remains on a stale generation and delivers fictional `EFGH` (4 additional application bytes) on an accepted HTTP/2 stream. A's local GOAWAY/ACK is not a cross-process revocation fence.
2. Bounded local mitigation: both publishers revoke and cancel held streams before synthetic ACK. No post-ACK `EFGH` is observed and a new B request returns 403. A paused B receiver still reads pre-ACK `ABCD` after ACK, demonstrating that read-time is not send-time. Neither cancellation nor ACK proves last-byte receipt or absence of buffered copies.

Test: `node --test tests/tur089-http2-cross-process-revocation.test.mjs`. Node 22.16.0 local 2/2 PASS and 10 independent reruns 20/20 PASS. New PR-scoped read-only GitHub Actions workflow is `.github/workflows/tur089-http2-cross-process-revocation.yml`. **Final GitHub CI must be independently checked at the last report commit**; no speculative success claims.

## Release boundary
Fictional ASCII and local h2c only; no real Cloudflare, R2, CDN, cache purge, TLS edge, workerd, Next/vinext, PostgreSQL, Queue or production handler. No production code, dependency, lockfile or infrastructure change. Issue #22 OPEN and NO-GO. Preserve TUR018 12 synthetic scenarios / 99,276 fictional bytes and TUR019 cross-isolate bypass.

Hard gates unchanged: independently privileged PostgreSQL16 schema-owner/SECURITY DEFINER/CREATE ACL and operator IAM; immutable original outbox canonical SHA and route allowlist; broker/Queue/DLQ ambiguous COMMIT/ACK-loss and lease; local vinext/workerd stale-cache, Chromium a11y/SEO/perf; TUR002 frozen pnpm, AGPL/LGPL libvips provenance; media/source rights and TOPWHIZ/TOPWIZ trademark independent review.

No main merge, live Cloudflare Preview/deploy/Queue/R2/CDN/cache purge, Neon/prod DB, DNS, real content/media/prices/merchant feed or AdSense. **Release NO-GO.**
