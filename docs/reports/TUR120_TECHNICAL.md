# TOPWHIZ TUR120 — 12 November 2026

Public repository: `ftmstr/TopWhiz-Build`. Stacked on TUR119 Draft PR #125 exact HEAD `bfaaef1a7ff80b7a256a4eb0e0dcdbdf5d18c50b`. Before creating this branch, latest 20 open user PRs ended at #125 and #126 returned 404; no TUR120 branch was found. Parent exact-HEAD GitHub Actions: 19/19 completed SUCCESS, no failed/pending in the connector's first page. Parent TUR119 special run #43206834522 job completed SUCCESS.

New isolated test: `services/prices-worker/tests/tur120-http2-cross-tenant-304.test.mjs`. New frozen CI workflow: `.github/workflows/tur120-http2-cross-tenant-304.yml`. Four reports are part of the same Draft PR. CI on the final report HEAD must be independently rechecked; this document is not itself CI acceptance.

Preserve Issue #22 OPEN and release HARD NO-GO, TUR018 12 synthetic scenarios / 99,276 fictional bytes and TUR019 cross-isolate bypass. Remote R2/CDN final physical receiver byte/ACK, global invalidation, independent IAM, media rights and TOPWHIZ/TOPWIZ trademark approval NOT PROVEN. No main merge, live Cloudflare Preview/deploy/Queue/R2/CDN/cache purge, Neon/prod DB, DNS/domain, real media/content/prices/merchant feeds or AdSense. Engineering work-package estimate 75%, NOT production readiness.

## Distinct local HTTP/2 adversarial case

Three real loopback HTTP/2 servers: independent per-tenant rights authority, content-only origin and synthetic gateway. Origin deliberately uses identical ETag `"shared-content-only-etag"` for A/item (`AOLD`), B/item (`BNEW`) and B/alt (`BALT`). Deliberately unsafe gateway stores an ETag result under a single global key; guarded test model scopes cached content to tenant + asset + verified rights generation.

Warm tenant A. Hold two unsafe tenant B conditional 304 responses. Revoke tenant A; independent authority ACK says generation 2, approved false. Release the two 304s: unsafe gateway serves A's `AOLD` to B/item and B/alt after ACK (8 fictional cross-tenant bytes). Guarded model denies revoked A with HTTP403, serves B/item `BNEW` and B/alt `BALT`, and reuses B/item only within the same scope. Authority outage yields HTTP403, not cached bytes. Assert exactly 2 held cross-tenant 304, 1 safe same-scope 304 and 3 total 304.

This is an intentionally vulnerable **test model**, not production code or a real customer incident. The production CDN last-byte revocation guarantee is not demonstrated. No production code, dependencies or lockfiles changed.
