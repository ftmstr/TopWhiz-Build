# TOPWHIZ TUR012 — Technical development report
Date: 2026-11-08
Repository: https://github.com/ftmstr/TopWhiz-Build
Branch: feat/tur012-publication-rollback-cache-ordering-20261108
Stacked Draft PR: https://github.com/ftmstr/TopWhiz-Build/pull/15
Parent: TUR011 Draft PR #14, exact parent HEAD 45265de5c18bd7981e4f4a7309075d2297fcb831.

## Verified baseline
Parent PR #14 was OPEN/Draft/unmerged. Read TUR011_REPORT.md,
TUR011_SECURITY_REVIEW.md and TUR011_ROLLBACK.md in the parent branch.
All nine inherited parent CI workflow runs on exact SHA 45265de5c18b
completed SUCCESS. The main branch was 71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6
and branch protection was disabled. No main merge, deployment or DNS.

## Delivered
1. Migration 0009_cms_publication_rollback.sql (CI-only):
   cms_publication_heads identifies the explicitly selected immutable
   PUBLIC edition; absent head rows fall back to latest for prior records.
   cms_publication_rollback_audit holds reason, actor, from/to edition and
   monotonically increasing optimistic revision. cms_public_pages retains
   the same security-barrier rights/issuer checks against selected edition.
2. publication-rollback.ts implements internal rollbackPublishedVersion.
   Rejects withdrawn/quarantined states, unexpected active version or
   revision, nonexistent/younger historical edition, stale or revoked
   independent human review, unapproved source/media and revoked or altered
   issuer public key/exact Ed25519 signature. Source and issuer rows are
   locked before the mutable submission row. In a single PostgreSQL
   transaction it updates active public head, bumps revision, records
   an immutable audit row and writes durable published-route purge outbox.
   It DOES NOT reverse rights revocation or activate old withdrawn rows.
   External operator authentication and ticket validation are NOT built
   into this internal method; never mount it in public CMS intake.
3. Standard publisher sets the active head on each newly approved version;
   source and issuer revokers now resolve the ACTUAL selected publication
   instead of blindly using MAX(version). Source/media license revocation
   locks/modifies the license row BEFORE looking up affected publications.
   This is necessary to prevent historical rollback and rights revocation
   from passing each other without a withdrawal cache event.
4. New PostgreSQL tests:
   - t ur012-rollback (one isolated schema): v1/v2 history restore, exact
     audit and revision/outbox checks; denial after old license revoked;
     out-of-order and duplicate fully-synthetic official zone-purge API
     calls, completed durable Queue receipts and safe read view.
   - tur012-revoke-race (second isolated schema): eight simultaneous
     rollback candidates competing with source revocation, plus four
     independently signed rollback candidates competing with issuer
     revocation; only authorized public content survives. Zero actual
     production content, reviewer signing keys generated only in CI.
   - tur012-dlq (third isolated schema): 60 DLQ items across six
     concurrent batches, untrusted forged approvals, operator denial,
     audit outage, Queue offline, completed receipt replay and batch
     limits. Purge event schema now strips unexpected arbitrary fields.
5. R2 media integrity: original self-generated 256x160 RGBA PNG, 64
   parallel successful GET rehashes, 64 altered-blob rejections, HEAD
   content length, revoked asset 404, unsafe request 405 and truncation
   503. This is a synthetic object mock, NOT a live Cloudflare R2 bucket.
6. Real vinext+Cloudflare Vite plugin App Router remains on LOCAL
   workerd with frozen original dependency versions and no remote
   bindings; 40 local parallel route requests sample a bounded p95.
   Example initial CI sample p95=671ms is localhost runner-specific,
   NOT production latency, Core Web Vitals or a capacity guarantee.
7. Chromium real browser added 375/812/1024/1280 widths to TUR011
   320/360/390/768/1440/1920 checks. Checks synthetic PostgreSQL
   news/phones, valid PNG decode, distinct metadata, noindex/no canonical
   domain, keyboard focus, axe serious/critical and 12 local parallel
   HTTP requests. Fixed 1024 and 1280 hero/header overflow.
8. Dependency provenance: the frozen pnpm-lock graph contains Next.js
   16.4.5 -> OPTIONAL sharp 0.35.5 -> OPTIONAL binary libvips 1.3.4.
   A local Cloudflare Worker output file scan detects native libvips
   copies; this alone does NOT remove LGPL-3.0-or-later legal obligations.
   See TUR012_LICENSE_OPTIONS.md. The previous legal blocker remains.

## GitHub CI verification
An earlier COMPLETE 4/4 TUR012 CI run on e546f57f1ac7a297ac28d98c7ad4e5f0928a870b
was successful:
https://github.com/ftmstr/TopWhiz-Build/actions/runs/42484163184
(with 48/48 Node, all PostgreSQL including rollback/race/DLQ,
28/28 Chromium at 10 viewport sizes, frozen install, actual local
vinext workerd and supplier scanning).

The final PR HEAD AFTER reports and 128-R2-test addition MUST be
verified independently; record its exact workflow run IDs, four jobs,
browser and Node test totals and any release blockers in a PR comment.
Do not confuse earlier successful jobs with final acceptance.

## Launch NO-GO (mandatory)
No branch merge, Cloudflare Preview/deploy, account/DNS/domain,
production Neon/R2/Queues/DLQ, global CDN purge evidence, source
licensing system or operational Ed25519 verifier. No real news,
phones, specifications, images, prices, ads or Google AdSense.
Manual accessibility, real image AV/EXIF, load/traffic capacity,
LGPL/AGPL obligations and TOPWHIZ/TOPWIZ trademark clearance remain OPEN.
