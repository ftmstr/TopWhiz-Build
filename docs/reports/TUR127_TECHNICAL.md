# TOPWHIZ TUR127 — PostgreSQL16 DISCARD ALL transactional rejection and pooled identity fence
Date: 2026-11-12. Public ftmstr/TopWhiz-Build only. Parent TUR126 Draft PR #132 exact verified HEAD c14fc757602252d19efe0f4832218f01ab408d6f (19/19 workflow, 56/56 job SUCCESS), stacked on TUR125 #131. TUR127 did not exist at preflight.

## New physical experiment
TUR126 showed that BEGIN; RESET ROLE; failure; ROLLBACK resurrects an already active role after independently committed membership REVOKE. TUR127 tests a *different* proposed pool sanitation: DISCARD ALL issued inside a transaction. On disposable real PostgreSQL16, an independently authenticated non-superuser rights-admin commits REVOKE of a NOLOGIN executor role from a pooled broker. A has already SET ROLE executor and returned the physical pg.Pool(max:1) backend. B inherits the executor and reads a private synthetic row after revocation. B attempts BEGIN; DISCARD ALL; PostgreSQL must reject with SQLSTATE 25001. After ROLLBACK, the stale executor must still read the private row, proving rejected cleanup is not an ACK. A standalone DISCARD ALL outside transaction resets current_user to broker; SELECT and SET ROLE must both be denied SQLSTATE 42501. C checks out the same PID/backend_start with clean broker identity.

No test-only unsafe SECDEF cancellation RPC is introduced in this tour. Synthetic row 127 only; no production data. Independent admin has no superuser/CREATEROLE/pg_signal_backend. Test requires explicit CI, TUR127_DISPOSABLE_PG16 and localhost PG16 URL. Existing tests and production source untouched.

## Evidence contract
New test: services/prices-worker/tests/tur127-pg16-discard-all-transaction-pool.integration.test.mjs
New workflow: .github/workflows/tur127-pg16-discard-all-transaction-pool.yml
New CI requires frozen pnpm 10.18.3, Node22, Ubuntu24 postgres:16, TUR126–123 real PG16, TUR122–119 HTTP2 304, TUR118–092 owner/ACL/lease, TUR030 unknown COMMIT, TUR019 SECDEF, TUR018 immutable outbox SHA, TUR017 Queue/DLQ, TUR002 AGPL/LGPL/libvips hold. Existing Chromium mobile/desktop and vinext/workerd workflows remain unmodified.
This report is written before final CI; no PASS is claimed until the exact report HEAD has real completed GitHub Actions results. No manual standalone PG16/Chromium/workerd run claimed.

## Release and estimate
Issue #22 OPEN: TUR018 12 synthetic interleavings 99,276 fictional bytes and TUR019 cross-isolate bypass persist. R2/CDN receiver last byte, global cache purge, actual Next/workerd Request.signal and independent IAM not proven. Work-package progress estimate 75% (planning, NOT production readiness). HARD NO-GO. No main merge or live Cloudflare/Neon/R2/Queue/CDN/DNS, actual content/media/prices/feed or AdSense.
