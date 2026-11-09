# TOPWHIZ TUR019 — Technical delivery and synthetic acceptance
Date: 2026-11-09 | Public repository: ftmstr/TopWhiz-Build
Branch: feat/tur019-local-media-fence-no-go-20261109
Parent exact TUR018 commit: 5f62c5f7274eb9ddbdfe6a2f5c98c0807b239488
Stacked target: new Draft PR to TUR018, NEVER main.

## Independently verified starting state
TUR018 Draft PR #21 OPEN/unmerged; all four TUR018 reports read back
and 17/17 final-HEAD GitHub workflow runs completed SUCCESS.
No new feature PR already existed. main remains
71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6.
R2 release blocker Issue #22 remains OPEN: historical TUR018
12/12 synthetic after-final-check revocations produced 99,276 bytes
that the existing handler still sent. That test is preserved UNCHANGED.

## Implementation and realistic guarantee
New media-publication-fence.mjs is a CI-only per-JavaScript-instance
read/revocation barrier. Media read permit is acquired before any
rights lookup; revoker synchronously closes new admissions and waits
until enrolled response ReadableStreams drain or explicitly cancel.
Only then may its injected withdrawal callback COMMIT. After the
COMMIT callback returns, new local requests receive 404. On any
ambiguous/failing withdrawal, the asset is quarantined (503), never
automatically republished. Streams enforce 0 high-watermark to avoid
unbounded prefetching; no automatic timeout pretends that bytes finished.
This is a tested application-side stream lifecycle guarantee, NOT a
durable distributed/real-network final-byte proof.

Proofs: 24 enrolled image GETs with 12 drained and 12 cancelled;
8 later requests denied while revocation waits; post-last-DB-lookup
revoke ordering and failed COMMIT quarantine; stream error cleanup;
a *separate isolate* deliberately bypasses the local gate and remains
recorded as negative evidence. Single-process code is not mounted in
any production Worker/Cloudflare route. No Cloudflare credential,
Durable Object, shared DB lease or real R2 binding is used.

## Inherited gates and new checks
- Real isolated PostgreSQL 16 role-group CREATE drift plus four
  SECURITY DEFINER pg_catalog/trusted schema/pg_temp definitions and
  pg_temp shadow attempt; original outbox digest remains stable.
- TUR017/TUR018 canonical original outbox/12-way broker, lease and
  DLQ replay tests and TUR015 commit-uncertainty remain intact.
- 96 additional localhost vinext/workerd conditional/no-store,
  304/206 deny probes, no real zone purge.
- Real local Chromium in 390px and 1366px widths with false-index
  and inactive Ads guard, keyboard skip and automated axe. No WCAG
  certification or field LCP/INP measurements.
- Frozen pnpm and historic TUR002 lockfile protection preserved.
  AGPL/LGPL native libvips remain mandatory legal holds.

## Exact final CI audit requirement
The branch's final documentation/CI commit must run the full GitHub
Actions matrix again at that exact SHA. Post a separate independent
CI/technical/legal receipt in the stacked Draft PR after every run
finishes. An earlier code-HEAD success cannot be copied. Failed
exploratory jobs must be explicitly described rather than hidden.

## Release
DRAFT / NO-GO. No main merge, Cloudflare live Preview/deploy,
Neon/production PG, live Queue/DLQ/R2/CDN, DNS/domain, real phones,
news, prices, third-party images or AdSense.
