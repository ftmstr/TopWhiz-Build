# TOPWHIZ TUR094 — Signed HTTP/2 grant replay and revocation freshness (2026-11-11)

Base: Public ftmstr/TopWhiz-Build TUR093 exact HEAD `690879e28a0714cb2dc5f0455e11616afaaf7f3d`; 19/19 observable pull-request-triggered GitHub Actions SUCCESS. Separate stacked Draft PR targeting TUR093 branch; never merge main.

Three new Node.js 22 loopback HTTP/2 tests use a fictional HMAC grant for a synthetic media ID: (1) a valid old generation-1 signed grant is accepted by a freshly constructed deliberately unsafe publisher after generation-2 revocation and returns eight fictional bytes; (2) tampered signature, wrong media scope and expired receipt are rejected with 403; (3) a test-only fresh authority callback rejects stale held tail/new requests after revocation and rejects requests if authority is unavailable. No production code, persistent authority, independent process, external IAM or live R2/CDN is implemented. Cryptographic authenticity is NOT freshness or a last-byte revocation guarantee.

Local Node.js 22.16.0 syntax PASS; 3/3 initial tests PASS; ten additional independent executions 30/30 PASS. Dedicated GitHub workflow pins ubuntu-24.04, frozen pnpm and inherited original outbox/Queue and licensing gates. Final HEAD CI acceptance requires separate post-report verification; never infer from prior SHA.

Preserve TUR018 12 scenarios / 99,276 fictional bytes and TUR019 cross-isolate bypass. Issue #22 OPEN, release NO-GO. Estimated engineering work-package progress 75%, not production readiness. No Cloudflare live preview/deploy, R2/CDN/Queue, Neon, DNS, AdSense or main merge.
