# TOPWHIZ TUR009 — Technical development report

Date: 2026-11-08
Repository: https://github.com/ftmstr/TopWhiz-Build
Branch: feat/tur009-issuer-revocation-real-roles-dlq-wrangler-20261108
Stacked Draft PR: https://github.com/ftmstr/TopWhiz-Build/pull/12
Parent: TUR008 Draft PR #11 / f49f20356fb853c7d45963fcf9e7c3b30378d40c
**DRAFT ONLY. No main merge, Cloudflare Preview, deployment, real data or AdSense.**

## Starting evidence verified

- Draft PR #11: OPEN, draft=true, merged=false, correct parent HEAD.
- Read TUR008_REPORT.md, TUR008_SECURITY_REVIEW.md and TUR008_PREVIEW_ARCHITECTURE.md.
- TUR008 final CI 42463469275 and all five inherited TUR002/004/005/006/007
  runs completed SUCCESS on f49f20356fb853c7d45963fcf9e7c3b30378d40c.

## Delivered code

1. 0008_cms_issuer_lifecycle.sql adds version-scoped
   cms_public_issuer_dependencies, issuer-revocation audit, and a
   fail-closed security-barrier cms_public_pages view that verifies active
   issuer, unchanged public key and active signed attestation status
   for every automatic publication. A draft cannot replace those dependencies.
2. CmsRepository.publish rechecks Ed25519 attestation signatures and valid
   authority keys inside the PostgreSQL transaction. The exact publication
   issuer, key and review kind are stored with immutable content versions.
3. issuer-revoker.ts atomically revokes issuer identity and retracts affected
   published content with route deletion, durable purge outbox and audit.
   A separate reconciler withdraws content if an issuer key was rotated or
   previously verified evidence was revoked outside the initial revoke command.
   The public reader denies access immediately on issuer/key/evidence changes,
   before reconciliation or CDN cache purge finishes.
4. cms_roles.sql includes an eighth, separately scoped issuer admin and
   restricts publisher insert rights for immutable issuer dependencies.
5. cms-service-sessions.integration.test.ts opens eight genuine PostgreSQL
   LOGIN sessions with dynamically generated CI-only passwords, distinct role
   memberships, positive permissions and negative SQL privilege tests.
   No login identities were created on a production database.
6. dlq-redrive.mjs requires injected independently authenticated operator
   ticket verification, audit callback and persisted Queue receipt status.
   Invalid/unauthorized/processing events and failed re-enqueue operations
   do not receive acknowledgments. Repeated completed events do not resend.
   No live DLQ or Queue consumer has been enabled.
7. png-structure.mjs validates exact PNG chunk structure, CRCs, image
   dimensions and no trailing bytes. Original RGBA pixel fixtures include
   real zlib-compressed IDAT data, unlike earlier signature-only 12-byte mocks.
   R2 staging and delivery recheck structural validity and SHA-256; JPEG
   termination and WebP declared-size guards are added. Decoder/AV scanning
   is still a release gate.
8. Controlled Wrangler upgrade: pin 4.135.0 in prices-worker package.json
   and regenerate pnpm-lock.yaml via one-time **branch-only** GitHub workflow
   with no lifecycle scripts. The workflow, which briefly had write permission
   to update only the feature branch lockfile, was REMOVED after success.
   Normal workflows have contents:read. Frozen install checks pin and lockfile.
9. Experimental apps/web/vite.config.ts enables local nondeploy vinext
   compatibility probes while retaining the original Next.js build.
   Cloudflare production/preview bindings are NOT configured.

## Test evidence

Initial TUR009 strict security CI after full R2 fixture migration:
https://github.com/ftmstr/TopWhiz-Build/actions/runs/42465224734
COMPLETED SUCCESS at an earlier TUR009 commit:
- 45/45 Node unit/security/media tests PASS.
- Seven isolated PostgreSQL 16 integration steps PASS:
  price staging; CMS transactional; single-entry CMS/API/R2/Queue; eight-role
  ACL/source-media revocation; signer identity revocation/key rotation/evidence
  revocation; genuine eight LOGIN service sessions; authorized DLQ replay.
- Frozen pnpm 10.18.3 install; exact Wrangler 4.135.0; TS strict check; Next
  production build; both Wrangler --dry-run workers; vinext check PASS.
- Existing synthetic only. No real phone/merchant/news/media.

**The final feature HEAD after this report must be verified separately.
A local vinext exploratory job may fail because React 19.2.0 in the canonical
Next app is below vinext 1.4.4's React >=19.3.1 requirement. The experimental
CI can provision temporary peer dependencies but does not persist them.
This is deliberately NOT treated as a successful Cloudflare workerd runtime.**

## Mandatory no-go

- No Cloudflare account/Worker/Preview deployment, R2 bucket, Queue/DLQ,
  production Neon data or actual registered domain configured.
- No real external issuer signing service, secret vault, key rotation process,
  operator authorization issuer, source/photo contract or rights feed.
- No actual browser screenshot/mobile/accessibility/performance acceptance.
- No merchant offers, real prices, copyrighted product images, news or ads.
- TOPWHIZ/TOPWIZ trademark and AGPL legal review open; main branch protection
  still unconfigured. Do not merge stacked Draft PRs or advertise live readiness.

## Future gates

Dedicated scoped real reviewer roles, production-compatible React/RSC/vinext
migration with pinned reproducible lockfile, Access-protected offline preview
architecture, real licensed image codec/AV tests, Queue DLQ monitoring/redrive
runbook and full publish rollback before launch.
