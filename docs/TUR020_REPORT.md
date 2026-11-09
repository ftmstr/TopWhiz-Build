# TOPWHIZ TUR020 — Shared-generation revocation prototype and verification
Date: 2026-11-09 | Public: ftmstr/TopWhiz-Build
Branch: feat/tur020-shared-generation-revoke-prototype-20261109
Parent: TUR019 OPEN/DRAFT PR #23 at c90f07c99c14887bbcb408595d401455bfa21876
Target: a separate stacked Draft PR targeting TUR019, NEVER main.

## Starting proof
TUR019 had 18/18 final-SHA GitHub workflow executions SUCCESS;
TUR019 reports and R2 Issue #22 were independently inspected.
main remains 71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6.
TUR018 still has its original 12 synthetic R2 revocations
showing 99,276 fictional PNG bytes after the last authorization
snapshot. TUR019 demonstrated a cross-isolate bypass of a local
fence. Both are retained verbatim as negative regression evidence.

## New implementation (simulation only)
services/prices-worker/src/cms/media-generation-coordinator.mjs
implements a per-asset serialized, in-memory **synthetic ledger**
and independently instantiated clients sharing that ledger.
This resembles an invariant that an actual globally serialized
Durable Object or equivalent could implement. This is NOT a
Cloudflare Durable Object, durable persistence, production database
transaction, R2 integration, CDN invalidation or transport protocol.
It is not installed as production middleware.

An asset begins at generation 1. Every admitted read receives a
random capability bound to that generation. Revocation atomically
closes admission and advances its intended generation; only after
all registered local permits have been reported drained/cancelled
may a caller transition into COMMITTING and execute the injected
withdrawal. The callback succeeds -> REVOKED with generation 2;
failure/unknown outcome -> QUARANTINED. Restart during COMMITTING
also quarantines. No expiry may pretend a remote HTTP byte was
delivered, no implicit re-opening is possible.

## Adversarial tests
New node:test suite covers 32 simultaneous readers shared across
two facades, 16 drained and 16 cancelled permits, 12 late
admissions denied, stale publication generation/forged/reused
permit denial, singleton withdrawal callback, crash or ACK-loss
quarantine, and restart with outstanding reader permits.
Explicit negative tests prove that two *independent* unshared
ledgers allow split-brain access. Another negative test proves
locally declared stream completion does not prevent 5 bytes from
being delivered later by hypothetical HTTP/proxy buffering.
These 5 test bytes are fictional; this is not a Cloudflare report.

Inherited real isolated PostgreSQL 16 schema-owner/ACL,
SECURITY DEFINER, canonical original-outbox route SHA,
parallel Queue/DLQ and ambiguous COMMIT/lease tests remain
enabled in new four-job CI. Added 128 local vinext/workerd
conditional stale-cache probes and two real Chromium widths
(414px/1600px), keyboard/axe/SEO/noindex and CI-local navigation
smokes. No actual external CDN cache purge or field Web Vitals.

## Supplier and safety boundary
Frozen pnpm 10.18.3 and unchanged pnpm-lock.yaml; prior TUR002
unfrozen install hole stays closed. No package or license upgrades.
AGPL-3.0 and native sharp/libvips LGPL-3.0-or-later legal
clearance, third-party content/source rights, TOPWHIZ/TOPWIZ
trademark, external IAM and branch protections are unresolved.

## Exact final CI receipt
Read every changed file from the final **report** HEAD; verify
GitHub Actions on exactly that SHA (not the earlier code HEAD),
inspect real Node/PG/Chromium/workerd logs. Publish links and
failures/pending/NOT_RUN statuses in the new Draft PR comment.
Do not claim success before that confirmation.

**DRAFT / NO-GO**: no main merge, live Cloudflare Preview/deploy,
Queue/DLQ/R2/CDN purge, Neon/production DB migrations, DNS/domain,
real phones/news/images/specifications/prices, external merchants,
Ads/AdSense or operator privileges.
