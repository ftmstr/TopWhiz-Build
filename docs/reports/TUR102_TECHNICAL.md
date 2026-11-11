# TOPWHIZ TUR102 — HTTP/2 queued DATA after rights revocation (2026-11-12)

Canonical Public ftmstr/TopWhiz-Build only. Parent TUR101 Draft PR #107 exact HEAD `74bcda70c7fbbd8c73c58f29b1e95e8a2855268f`; 19/19 first-page PR-triggered GitHub Actions SUCCESS at preflight. TUR102 PR and branch absent at preflight. New stacked branch begins at exact TUR101 HEAD, never main.

Four new deterministic real Node.js 22.16.0 loopback h2c tests: (1) unsafe publisher emits `TAIL` after revocation ACK; (2) per-write epoch check cancels `TAIL`, but already committed HTTP 200/`HEAD` cannot be retracted; (3) server queues `TAIL` before ACK while the client application pauses, then client resumes and consumes `TAIL` after ACK; (4) authority outage prevents further guarded `TAIL`. Initial 4/4 PASS; ten independent repeats 40/40 PASS. Test SHA-256: `77329a5225851d435e89e760a2e726a02cafe24d395e1928087c6f5fa9b2cd57`.

**Critical measurement boundary:** paused-client application receipt ordering is NOT proof of the physical network byte transmission time. `stream.write`/`stream.end` and a rights ACK are NOT a remote receiver receipt or global R2/CDN invalidation fence. No production source/dependency changes. New dedicated Ubuntu 24.04 workflow inherits disposable PG16, frozen pnpm, canonical outbox/Queue, SECDEF/ACL and license gates; independent Chromium/workerd local rerun NOT_RUN. Final GitHub CI must be checked at exact report HEAD; local PASS is not CI PASS.

Issue #22 OPEN, release NO-GO. TUR018 12 synthetic cases/99,276 fictional PNG bytes, TUR019 cross-isolate bypass preserved. Work-package estimate 75% (not production readiness). No main merge or live Cloudflare/Neon/R2/Queue/CDN/cache purge/DNS, real media/content/price/feed or AdSense.
