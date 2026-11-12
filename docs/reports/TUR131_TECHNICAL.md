# TOPWHIZ TUR131 — Real PostgreSQL16 wire-level COMMIT ACK loss (2026-11-12)

## Public stacked provenance
Parent TUR130 Draft PR #136 exact HEAD `bddaf27ba06080d9426d6ff3485cdbfaffcf2922`; 19/19 PR-triggered workflows and 56/56 jobs SUCCESS independently checked, dedicated PG16/HTTP2 run #43286322392 real job #131420566819 log inspected. Issue #22 OPEN. TUR131+ PR #137–145 absent at preflight; unique branch directly from exact parent. New additive test, Ubuntu24 postgres:16 workflow, four reports; no production code, SQL migration, IAM, R2 or Queue mutation.

## New physical test and assertions
Native Node22 TCP proxy relays PostgreSQL16 protocol to localhost:5432, then intercepts the real server CommandComplete COMMIT and ReadyForQuery after a synthetic transaction. Both are deliberately withheld from the client and its TCP connection is physically destroyed. The client must see TRANSPORT_UNKNOWN, not an acknowledged COMMIT. A fresh independent PG connection must find exactly one durable synthetic row; an idempotent ON CONFLICT DO NOTHING retry must add zero rows. A separate explicit ROLLBACK control must leave zero rows. No real Queue/R2 broker ACK or production client code is involved. This is different from TUR130's 23505/25P02/RST rollback, and TUR030's simulated unknown COMMIT.

## Mandatory CI acceptance
The exact-final-report-commit must run real Ubuntu24 postgres:16, frozen pnpm 10.18.3, the new Node test and inherited TUR130–092 PG16/HTTP2, TUR122–119 304 stale-cache, TUR030 original unknown-COMMIT, TUR019 SECURITY DEFINER/CREATE ACL and cross-isolate, TUR018 immutable original outbox SHA/route allowlist and 12/99,276 synthetic revoked bytes, TUR017 Queue/DLQ and TUR002 AGPL/LGPL/libvips gates. Existing vinext/workerd and physical local Chromium mobile/desktop a11y/SEO/perf must also succeed. Syntax check is not PG16 acceptance; no PASS until exact SHA and actual job logs confirm.

## Nonclaims and hard release block
This test does not show independent operator IAM, lost Queue receiver ACK, broker lease durability, production Request.signal, OS PID reuse, remote R2/CDN receiver final byte or globally synchronized cache revocation. Issue #22 OPEN / hard NO-GO; preserve TUR019 cross-isolate bypass. TOPWHIZ/TOPWIZ trademark, media source rights and operator IAM need independent approval. Engineering work-package planning estimate 75%, never production readiness. No main merge, live Cloudflare/Neon/R2/Queue/CDN/cache purge/DNS, real content/media/prices/feeds or AdSense.

## CI iteration audit
Initial dedicated run #43296474727, job #131456022538 FAILED: test expected a physical PostgreSQL connection drop, but did not register a pg.Client `error` EventEmitter listener. Node test reported `uncaughtException: Connection terminated unexpectedly`; inherited steps were SKIPPED. The same Draft PR fixes the test harness by absorbing the expected client error event while still asserting the rejected COMMIT query and independent durable outcome. Initial failure is retained, not represented as PASS. Final SHA must be rechecked independently.
