# TOPWHIZ TUR013 — Technical development report
Date: 2026-11-08
Branch: feat/tur013-cache-fence-ack-dlq-20261108
Parent: TUR012 Draft PR #15 at 95669e92fee7d5b37f025fc53d0d4ed2bf75e091
Stacked target: TUR013 Draft PR #16; no main merge or deployment.

## Independently verified starting state
Parent PR #15 was OPEN/Draft/unmerged; its four TUR012 reports were read.
All 10 parent exact-SHA workflows completed SUCCESS (TUR002,004–012).
Main remained 71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6
with branch protection disabled.

## Engineering delivered
1. Migration 0010_cms_cache_fences.sql introduces an immutable-publication
   generation fence table tied to a real previously approved version.
   Its generation must equal the revision of the latest committed
   publication/withdrawal outbox event, match the active immutable
   public head and remain at or below the submission revision.
   Security-barrier cms_public_pages denies absent, forged, outdated
   and withdrawn fences, in addition to source/media/issuer checks.
   CI-only migration backfills only already-published records with
   actual outbox evidence. It never resurrects withdrawn submissions.
2. CmsRepository publish/withdraw, operator historical rollback,
   source/media revoker and issuer revoker/reconciler atomically update
   the fence in the same PostgreSQL transaction as revision, audit
   and durable outbox. Unapproved draft revisions do NOT change
   the currently approved public head.
3. Migration 0011_cms_queue_receipt_hash.sql adds optional
   event_sha256 to persisted purge receipts. New Queue handling
   independently matches UUID, submission, event kind, revision
   and exact allowlisted routes with cms_delivery_outbox BEFORE purge.
   Then it binds the canonical body SHA-256 to the receipt UUID.
   A changed body cannot inherit a prior successful claim or ACK.
4. Queue consumers ACK only after a successful purger callback and
   persisted receipt completion. DB outage, failed purge or lost
   lease retries. CMS outbox status=delivered means QUEUE ACCEPTED,
   not verified CDN purge. Legacy NULL-digest receipts need careful
   inventory/reconciliation before any real deployment.
5. DLQ redrive now requires the original durable outbox event as
   well as the separately approved operator ticket, audit-before-send,
   bounded batches and receipt status. Unit mocks and old CI-only
   PostgreSQL DLQ datasets were upgraded rather than bypassing checks.
6. The read-only CMS/price API and local vinext App Router return
   private/no-store Cache-Control plus no-store CDN headers for dynamic
   results. Pre-handler Workers caching is disabled in isolated
   Cloudflare Vite config and API Wrangler config. robots.txt is a
   static policy asset tested separately. This cannot invalidate
   objects PREVIOUSLY cached on a real Cloudflare zone.
7. R2 media reader now makes a second rights/public-usage database
   check AFTER SHA-256/structure/size verification, before releasing
   any bytes. This narrows, but cannot eliminate, revocation TOCTOU.
8. No new npm dependencies or pnpm-lockfile edits; React/RSC,
   Next, vinext, Wrangler and Vite pins and frozen CI preserved.

## Real synthetic CI evidence BEFORE report commits
https://github.com/ftmstr/TopWhiz-Build/actions/runs/42487597721
Successful CODE HEAD 9d9810a9eb2e750d50b3b424b9eaf9394cbb005d:
all 4 TUR013 jobs completed SUCCESS, 50/50 Node security/media
tests, 13/13 separate ephemeral PostgreSQL 16 suites including
the new fence and Queue ACK tests, 36/36 real Chromium tests,
local Cloudflare Vite+vinext/workerd, Next+TS+vinext and two
Wrangler dry-run builds, high/critical pnpm production advisory
gate and explicit license inventory. Local workerd 40 concurrent
HTTP probes, one runner p95=306ms: NOT real-world performance.
New R2 tests: 96 valid + 96 mutated PNG GETs, metadata forgeries,
broken streams, and in-flight license revocation. The preexisting
TUR012 64+64 image test and TUR011 tests also remain active.
New fence tests: 18 approved fictional publications, forged
generation denial, 17 source-related withdrawals, 38 durable
events, and 64 parallel revoked-content reads. New Queue tests:
40 competing deliveries, 1 purger, altered event bodies denied,
database commit failure retried with no ACK, and exactly bound
durable receipt states. All content/media/signatures synthetic.

IMPORTANT: final HEAD after report commits and PR creation must
have ITS OWN exact-commit CI verification. The preliminary successful
code run is not final-HEAD acceptance. Final run URLs and evidence
belong in the PR #16 Conversation comment.

## Release NO-GO
No merge to main; no live Cloudflare Preview/deploy, Access, DNS,
R2 bucket, Queue/DLQ, global cache purge or production Neon migrations.
No actual news, phones, third-party photos, specifications, prices,
merchant feed, reviewer private keys, AdSense or ads.
TOPWHIZ/TOPWIZ trademark, AGPL/LGPL/image/source legal review,
production observability, branch protection, manual screen-reader
and field performance remain unapproved.
