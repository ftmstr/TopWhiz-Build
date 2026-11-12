# TOPWHIZ TUR128 — physical PG16 pool quarantine after failed cleanup
Date: 2026-11-12. Public ftmstr/TopWhiz-Build only. Parent TUR127 Draft PR #133 exact HEAD `790c8484384cbdc9bf82d13d531bcc917972cda6`, 19/19 PR workflows and 56/56 jobs SUCCESS independently queried. TUR128 PR and branch absent at preflight. New branch created on exact parent HEAD; no main merge.

## Distinct new experiment
TUR127 established that transactional DISCARD ALL fails SQLSTATE 25001 and leaves a stale SET ROLE after an independent restricted rights-admin REVOKE COMMIT. TUR128 tests the *physical containment decision* after that failure: pg.Pool(max:1) A hands a SET ROLE executor backend to B; admin commits REVOKE; B still reads one fictional private row. BEGIN; DISCARD ALL fails 25001; ROLLBACK retains the revoked active identity. The dirty B connection must be quarantined with `release(true)`, reducing pool.totalCount and idleCount to zero. A new checkout C must use a different physical PID/backend_start and broker identity; private SELECT and SET ROLE must fail 42501. D must safely reuse C's clean backend without inheriting the old executor.

## Scope and limitations
Actual disposable PostgreSQL16 on localhost, four synthetic roles, independent non-superuser rights-admin, no global pg_signal_backend, no production data, no production code modification. This is a test of pool containment, not proof that an application has wired every error path to destroy the connection; PID uniqueness alone is not a cryptographic ownership proof. A post-quarantine callback/lease race and actual Next/workerd Request.signal remain unproven. Test requires explicit CI and TUR128_DISPOSABLE_PG16. No independent manual PG16/Chromium/workerd run claimed.

## Evidence contract
Test: `services/prices-worker/tests/tur128-pg16-dirty-pool-quarantine.integration.test.mjs`
Workflow: `.github/workflows/tur128-pg16-dirty-pool-quarantine.yml`
Inherits TUR127–123 real PG16, TUR122–119 HTTP2 304, TUR118–092 ACL/pool/SECDEF, TUR030 unknown COMMIT, TUR019 SECDEF, TUR018 canonical original outbox SHA/route allowlist, TUR017 Queue/DLQ, TUR002 AGPL/LGPL/libvips release hold. Existing Chromium and vinext/workerd workflows unchanged. This report is authored before final-head CI: SUCCESS must be established by real GitHub Actions, not asserted in advance.

## Release and estimate
Issue #22 OPEN. TUR018: 12 synthetic interleavings, 99,276 fictional bytes after revocation; TUR019 cross-isolate bypass preserved. No remote R2/CDN receiver last-byte guarantee. Independent IAM, source rights and TOPWHIZ/TOPWIZ clearance missing. Estimated engineering work-package progress: 75%, not production-readiness. HARD NO-GO; no main merge or live Cloudflare/Neon/R2/Queue/CDN/cache/DNS/content/prices/feed/AdSense.