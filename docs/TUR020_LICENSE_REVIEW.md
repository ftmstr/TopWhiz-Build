# TOPWHIZ TUR020 — Frozen supplier and licensing NO-GO
Date: 2026-11-09. Legal inventory ONLY.

The exact same package.json, pnpm-lock.yaml and dependencies are
retained from TUR019. packageManager pnpm@10.18.3, lockfile
version 9, frozen install in all four new CI jobs.
Historical TUR002 --no-frozen-lockfile was removed in TUR018,
and its --frozen-lockfile guard remains. TUR005 one-time
branch-restricted lockfile generation is not release approval.
Production high/critical advisory and native license inventory
commands remain active even if all synthetic CI tests succeed.

Dependency chain from prior source review:
Next.js 16.4.5 -> optional sharp 0.35.5 ->
@img/sharp-libvips-* 1.3.4, native LGPL-3.0-or-later.
Whether actual distribution meets AGPL-3.0 source/network
terms, LGPL linking/relinkability, source/notice and container
redistribution requirements must be evaluated by independent
qualified counsel. No legal clearance is asserted.

The new generation ledger is a test-only pure JS coordinator.
It does not waive or mitigate third-party source licenses,
actual images/photos, manufacturer data and merchants' prices.
TOPWHIZ/TOPWIZ trademark clearance, image rights, AdSense,
privacy/consent, production operator IAM and real R2 rights
Issue #22 are all open. No client/site release.

**Approval: NO-GO.** No main merge, live Cloudflare Preview,
deploy, R2, Queue, CDN/cache purge, Neon/prod migration,
DNS/domain, real content/images/offers or AdSense.
