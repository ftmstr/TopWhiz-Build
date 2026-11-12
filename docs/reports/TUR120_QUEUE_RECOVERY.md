# TOPWHIZ TUR120 — 12 November 2026

Public repository: `ftmstr/TopWhiz-Build`. Stacked on TUR119 Draft PR #125 exact HEAD `bfaaef1a7ff80b7a256a4eb0e0dcdbdf5d18c50b`. Before creating this branch, latest 20 open user PRs ended at #125 and #126 returned 404; no TUR120 branch was found. Parent exact-HEAD GitHub Actions: 19/19 completed SUCCESS, no failed/pending in the connector's first page. Parent TUR119 special run #43206834522 job completed SUCCESS.

New isolated test: `services/prices-worker/tests/tur120-http2-cross-tenant-304.test.mjs`. New frozen CI workflow: `.github/workflows/tur120-http2-cross-tenant-304.yml`. Four reports are part of the same Draft PR. CI on the final report HEAD must be independently rechecked; this document is not itself CI acceptance.

Preserve Issue #22 OPEN and release HARD NO-GO, TUR018 12 synthetic scenarios / 99,276 fictional bytes and TUR019 cross-isolate bypass. Remote R2/CDN final physical receiver byte/ACK, global invalidation, independent IAM, media rights and TOPWHIZ/TOPWIZ trademark approval NOT PROVEN. No main merge, live Cloudflare Preview/deploy/Queue/R2/CDN/cache purge, Neon/prod DB, DNS/domain, real media/content/prices/merchant feeds or AdSense. Engineering work-package estimate 75%, NOT production readiness.

## Original outbox / Queue / DLQ invariants

No broker, DB schema, R2 or Queue mutation. Preserve original canonical outbox SHA and strict route allowlist; never treat HTTP304, ETag freshness, cache hits or an unrelated tenant's rights ACK as original outbox receipt, Queue ACK, lease ownership or publication permission. Keep independent lease and idempotent retry under parallel broker/Queue/DLQ and unknown COMMIT ACK.

New CI inherits TUR030 uncertain COMMIT, TUR019 SECDEF/CREATE ACL, TUR018 canonical-route SHA, TUR017 outbox recovery, real disposable PostgreSQL16 owner/ACL/lease tests and physical HTTP/2/PG16 cancellation. Any failing, pending or skipped final-head workflow must be disclosed; historical green is not a substitute.
