# TOPWHIZ TUR053 — Technical report — 2026-11-10

## Verified baseline
TUR041 Draft PR #46 HEAD `7e64372bcb14c155cf104c6812e28c606e6c8d0e` completed 20/20 exact-SHA GitHub Actions SUCCESS; hourly automation advanced through TUR052. TUR052 canonical stacked Draft PR #57 HEAD `ae96d5982a48f28342f42e7561c2565db2e4318b` was independently verified 20/20 exact-SHA GitHub Actions SUCCESS, and TUR053 did not already exist at branch creation. This is a separate stacked Draft PR on TUR052; no completed tour duplicated.

## Distinct new acceptance
The new `services/prices-worker/tests/tur053-next-abort-pg16.integration.test.ts` runs the **genuine Next.js production `next start` HTTP server**, the original `/media/cms/[id]` route and original CMS `handleCmsMedia`. It reuses the previously accepted fail-closed **CI-only TUR041 preload** to intercept only `https://cms.ci.invalid`; its in-memory R2 substitute serves a repository-generated original SHA-256 verified PNG. Disposable **real PostgreSQL16** has two independent password-authenticated LOGIN identities with disjoint permissions.

Two live HTTP requests are admitted simultaneously and deterministically paused after approved final PG16 SELECTs. While both are pending, one actual Node TCP client destroys its socket **before any response headers**. The sibling remains connected. A distinct PG16 revoker atomically commits rights=false and generation increment for both assets and releases their database-held gates. The surviving old request can still receive the complete fictional PNG **after COMMIT**; fresh GETs after COMMIT are rejected. The aborted client's zero observed body bytes prove only local client cancellation, **not server-side cancellation or absence of buffered delivery**.

No actual production code, schemas, dependencies or lockfile were changed. Previous TUR030 independent actual PG16 COMMIT ACK transport cut is inherited; this tour's own COMMIT is ACKED and does **not** newly reproduce a lost acknowledgement. No external R2/CDN/Neon, TCP wire timing or remote receiver acknowledgement is claimed. This is additional negative security evidence, not remediation. CI must be checked at the exact final HEAD.

**Progress estimate 66/100 engineering work-package points** (architecture 14/15; UI 12/20; backend 21/25; security evidence 10/20; CI 9/10; commercial/legal 0/10). This is not a production-readiness score. RELEASE NO-GO, Issue #22 OPEN.
