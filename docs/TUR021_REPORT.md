# TOPWHIZ TUR021 — Durable PostgreSQL media admission/revocation prototype
Date: 2026-11-09 | ONLY Public ftmstr/TopWhiz-Build
Stacked parent: Draft PR #24 at d4925c4368af02983ccde41c8ba19774b3a096a1
Target: a new Draft PR based on feat/tur020-pg-durable-media-fence-20261109
Correction: branch is feat/tur021-pg-durable-media-fence-20261109.
Never merge to main.

## Independently verified starting point
TUR020 Draft PR #24 OPEN/DRAFT/unmerged, four TUR020 reports
read from exact source SHA and 19/19 Actions SUCCESS at that SHA.
Main still 71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6.
R2 Issue #22 OPEN, including original TUR018 negative evidence:
12 synthetic revoked-after-last-check streams, 99,276 fictional
image bytes after withdrawal. Inherited TUR019 cross-isolate
local-lock bypass and TUR020 5-byte post-local-EOF negative test
remain unchanged.

## New hardening / verification
0018_cms_media_durable_fence_ci.sql is a **CI-only, REVIEW-only**
PostgreSQL 16 migration. It introduces media-generation state and
explicit opaque admission capabilities in tables that persist across
independent database sessions. It is NOT installed in a Cloudflare
Worker or published media handler, and it is NOT a production
migration. All public function EXECUTE is revoked by default.
A trusted schema-owner and CREATE ACL preflight runs at migration
time and inside every exposed SECURITY DEFINER operation.
Function search_path is pinned pg_catalog, trusted schema, pg_temp;
no new app role/table rights are granted.

An approved fictional asset is manually enrolled at generation 1.
Database clients acquire generation-bound permits under row lock.
Beginning rights revocation atomically seals admission. The
commit step rejects outstanding local permits; it updates
cms_media_assets.rights_approved=false AND advances generation
to 2 in the same PostgreSQL transaction. A rollback preserves
a revoking fence, so retry of the same capability is explicit.
If the COMMIT success response is lost, a new DB session can
inspect the durable revoked state rather than sending a second
revocation. No automatic permit expiry is a last-byte proof.

Isolated PG16 test opens real independent login sessions with
synthetic and separate reader/revoker EXECUTE grants. It covers
24 concurrent permits, 12 blocked late admissions, 12 drained
and 12 cancelled local permits; unauthorized direct DB UPDATE,
duplicate permit/revoke, stale generation, post-install named
role CREATE privilege drift and owner/out-of-band direct writes.
Owner bypass is deliberately retained as a negative result.
It also simulates lost COMMIT response and pre-COMMIT rollback,
without asserting external Queue/CDN exactly-once.

Node inherited TUR018/TUR019/TUR020 tests plus TUR017–TUR020
PostgreSQL original outbox SHA, allowed routes, SECURITY DEFINER,
12-broker contention and Queue/DLQ uncertain COMMIT remain enabled.
Local vinext/workerd 160 conditional/range/no-store synthetic probes;
Chromium responsive views 320x760 and 1920x1080, keyboard/axe,
404/noindex, placeholders and local-only timing. All package pins,
the frozen TUR002 install, AGPL and native LGPL license HOLD retained.

## Exact-final-SHA evidence process
This report is committed before the exact-final-HEAD CI acceptance.
Verify actual per-run statuses and real PostgreSQL, Node, Chromium
and workerd logs; include ALL final run links, passing/failed/pending
counts and any corrected exploratory failures in Draft PR comments.
No earlier SHA or test-as-designed claim can substitute for
final report-commit GitHub Actions SUCCESS.

## Hard publication safety
No main merge or live Cloudflare Preview/deploy/Queue/DLQ/R2/CDN/
global purge, Neon/production PG migration, domain/DNS, live
phones/articles/images/specs/prices or AdSense. R2 issue #22 OPEN.
Real network last-byte transport, IAM/dual control, independent
rights audit, cache invalidation and publisher source licenses
remain unproven. Release: NO-GO.
