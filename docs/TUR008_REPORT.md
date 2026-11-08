# TOPWHIZ TUR008 — Technical development report

Date 2026-11-08.
Repository: https://github.com/ftmstr/TopWhiz-Build
Branch: feat/tur008-privileges-revocation-dlq-20261108
Stacked Draft PR: https://github.com/ftmstr/TopWhiz-Build/pull/11
Parent: TUR007 Draft PR #10 at a00cc25bb7a721af73ca23970f2fca9d8e0eabc2.
Status: DRAFT / MAIN UNCHANGED / NO DEPLOY.

## Verified starting state

PR #10 open/draft/unmerged; both TUR007 reports re-read.
TUR007 final CI run 42414497585 completed/success.
Inherited web/price/PostgreSQL regressions also passed at baseline.

## Delivered

1. SQL migrations 0006 and 0007: issuer signature records, public-view ACL,
   immutable published-version resource links, takedown audit and durable Queue
   receipts. Migration scripts are exercised only on disposable PostgreSQL 16.
2. Role bootstrap script and CmsIntakeRepository: seven NOLOGIN groups with
   guarded SECURITY DEFINER draft-only write, reader views, reviewer/rights
   access separation. CI verifies positive/negative permissions with SET ROLE.
3. Crypto identity: Ed25519 signed issuer, submission/revision, timestamp,
   evidence and credited author; transient CI-generated signing keys.
4. License revocation: source/media approval disabled and every affected
   published version withdrawn with route deletion and durable purge events.
   A revised-but-not-approved draft cannot mask dependencies of an earlier
   public snapshot.
5. Queue receiver: durable receipt state and claim token ensure retry does not
   incorrectly acknowledge a failed global cache purge. DLQ with five retry
   attempts is provided as example configuration ONLY.
6. R2 media: read response bytes under a strict 10 MiB ceiling, check image
   signatures and recompute SHA-256 regardless of stored object metadata.
7. Secure vinext/Cloudflare preview architecture and static preflight: no
   production bindings, no real ad code, no content; Wrangler 4.131.0 fails
   the actual Workers Preview >=4.135.0 gate by design.

## Preliminary test evidence

Before this report, GitHub Actions run
https://github.com/ftmstr/TopWhiz-Build/actions/runs/42463188012
completed SUCCESS at earlier feature SHA 01c3f5790865c2f39e56f12b3aa4c0ada1f7e6cb:
- 43 of 43 unit/security/media tests PASS.
- Four PostgreSQL integrations: price-staging, CMS transactional lifecycle,
  signed-intake through approved public API, and role/revocation/receipt each PASS.
- Frozen lockfile install, TypeScript, Next.js production build, two Wrangler
  --dry-run bundles and vinext static compatibility PASS.
- vinext static compatibility 95%: 10 supported, 1 partial, 0 issues.
- Preview preflight: plan_only; no live Preview; pinned Wrangler 4.131 below
  Cloudflare Preview CLI minimum 4.135.

The most recent HEAD after this report MUST have its own checked CI evidence.
Do not assume the earlier result covers newer commits.

## Unfinished release gates

Actual service-role DB logins, external signing service, source/media license
feed, authority-revocation reconciliation, live Queue/DLQ, separate preview
Neon/R2 and Cloudflare Access, real R2 image decoder QA, vinext runtime Preview,
browser accessibility/SEO/performance, source rights, TOPWHIZ/TOPWIZ mark and
AGPL review. AdSense/site/account approval pending.

No main merge, Cloudflare deployment, public Preview, domain or live AdSense.
All CI data is entirely fictional and isolated.
