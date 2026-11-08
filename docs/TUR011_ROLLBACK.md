# TOPWHIZ TUR011 — Fail-closed rollback and future runbook
Date: 2026-11-08. Current real deployment: NONE.

## Current state
Keep Draft PR #14 unmerged. To undo experimental work now, revert
the TUR011 feature commits and pnpm-lock.yaml changes on the feature
branch. The TUR010 Next.js and vinext defaults remain the base; main,
Cloudflare account, DNS, registered domain, production data and Ads
were never changed. End ephemeral GitHub CI/localhost process if active.

## Future isolated Preview, only after authorization
1. Disable new ingestion and Queue consumers, then revoke preview
   publisher/issuer credentials before cache changes.
2. Restrict preview route with Cloudflare Access and revoke preview-only
   API tokens. Never reuse production secret or an advertiser account.
3. Fail closed at public read layer: deny pages whose source/media
   rights, issuer status, public key or original signature changed.
4. Preserve immutable publication history, rights/reviewer audit,
   published routes and durable purge outbox without exporting keys.
5. Reconcile all revoked published versions and retry CDN purge
   from verified durable receipts. Never ACK a purge prematurely.
6. Validate no page/cdn leak, R2 integrity, Queue DLQ/manual redrive,
   404 and robots noindex on both mobile and desktop before restoring.
7. Run frozen dependency install, audit and license inventory; require
   legal sign-off for LGPL-3.0-or-later libvips and AGPL obligations,
   trademark rights, source contracts and private reviewer rotation.
8. Require human change approval for launch. Do not disable security
   gates to obtain a green pipeline.

Do not assume successful local workerd rendering establishes Cloudflare
Access, global CDN purge, worldwide latency, revenue eligibility or
a public production-ready website.
