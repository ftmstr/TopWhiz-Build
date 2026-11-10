# TUR063 — Dual-login guardian fail-closed real Next HTTP local acceptance
Date: 2026-11-10. Direct stack on TUR062 Draft PR #67 at `5e7a5a783d8f2e7564523db1eedd55eb1ae45a4f`. Work on separate Draft PR only; exact-final-HEAD CI acceptance must be independently checked.

## Independent, distinct new scope
TUR062 showed that the unchanged Next.js production HTTP route + unchanged CMS handler ignore a separately owned PostgreSQL16 guardian table, allowing the original synthetic PNG after revocation. TUR063 does not repeat that negative test or change the production route. A STRICT CI-ONLY Node preload injects an independently authenticated read-only guardian lookup into each of the existing media handler's **initial and final asset reads**, with equality of media/guardian generation and both approvals required. Separate non-superuser PG16 connections, not a shared mutable-media-owner credential. The original production Next `next start` localhost HTTP and CMS handler remain intact; only the synthetic CMS-origin transport is replaced.

New positive local cases: HTTP200 for matching approvals; HTTP404 and zero bytes for missing guardian row, guardian/media generation mismatch, guardian-only COMMITted revocation, and media owner disabling its own trigger/reapproving a media row while guardian remains denied. On independent guardian read privilege removal, SQL error propagates and original CMS handler returns HTTP503 with zero bytes; restoring privilege allows the matching synthetic image again. Fifth independent password LOGIN has guard SELECT but cannot UPDATE guardian; media owner has no SELECT/UPDATE on guardian table; its SECURITY DEFINER routine cannot mutate guardian.

## Honest limits
This is a CI-only integration adapter, **NOT a change to actual production CMS service wiring, Neon IAM, Cloudflare Workers, R2 or CDN**. A guardian check before Response still cannot prove zero bytes delivered when the revocation COMMIT races **after the final check**, or invalidate globally cached CDN bytes. No distributed epoch/lease linearization, receiver ACK or final network byte guarantee. Guard/schema owner, external rights admin IAM and recovery remain outstanding. This tour does not assert resolution of Issue #22, and inherits TUR018 12 synthetic schedules / 99,276 fictional unsafe bytes. Release remains NO-GO.

## Preserve
Original outbox SHA, Queue/DLQ lease, TUR030 unknown COMMIT TCP ACK, TUR053 disconnect, TUR060 SECURITY DEFINER and CREATE ACL, TUR062 independent guardian negative control, workerd, Chromium, frozen pnpm and AGPL/LGPL gates run in existing or new GitHub CI. No main merge/deploy or real content/fake prices/images/advertisements.

## Progress basis
Parent subjective engineering work-package estimate 69/100: architecture 14/15, UI 12/20, services 21/25, security evidence 13/20, CI 9/10, public/legal 0/10. If exact-head CI passes, security-evidence becomes 14/20, giving **70/100**; this is *development work-package progress*, not production readiness.
