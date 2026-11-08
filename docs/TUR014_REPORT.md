# TOPWHIZ TUR014 — Technical development and acceptance report
Date: 2026-11-08
Repository: ftmstr/TopWhiz-Build (Public AGPL-3.0)
Branch: feat/tur014-mutation-guards-legacy-recovery-20261108
Parent: TUR013 Draft PR #16, exact baseline HEAD b44da1050883147c344fe426fe8f6059fcfd24a9.
Target: stacked TUR014 Draft PR #17; base is TUR013 branch, NOT main.

## Baseline verified directly on GitHub
The parent PR #16 was OPEN/DRAFT/unmerged; read docs/TUR013_REPORT.md,
TUR013_SECURITY_REVIEW.md, TUR013_LICENSE_PROVENANCE.md,
TUR013_QUEUE_CACHE_RUNBOOK.md. GitHub returned all eleven parent
workflows (TUR002, TUR004–TUR013) completed SUCCESS at exact b44da105.
Main remained 71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6 and
unprotected. No live services were accessed.

## Delivered engineering

### 0012 — PostgreSQL deferred mutation COMMIT gate
- Create immutable cms_mutation_guard_ledger with the previously
  PUBLISHED dependent submission, sensitive resource class/id,
  expected next revision and actual database session login.
- Trigger immediately captures CURRENT active public dependents when
  a source/media rights_approved flag, issuer active/key or
  attestation status/signature is changed. All resources are
  matched against the selected historical publication HEAD, not the
  mutable draft or latest-ever version.
- An INITIALLY DEFERRED constraint trigger runs at transaction COMMIT.
  It refuses to commit a source/media/issuer/attestation mutation
  unless EVERY captured public submission has been withdrawn,
  generation fence advanced to the expected revision, public routes
  deleted AND a matching durable 'withdrawn' outbox event written.
  A raw SQL UPDATE without audited revocation is rolled back.
- Source license URL/evidence/reviewer metadata, image R2 key/digest/
  MIME/size/licence/reviewer, issuer reviewer-class metadata and
  original signed attestation binding are immutable in-place.
  Creating new resource IDs + independently approving is mandatory.
  Also block automatic false->true license/issuer reactivation.
- DELETE/TRUNCATE of protected rights/issuer/evidence records is
  blocked through PostgreSQL triggers. Ordinary database roles cannot
  disable these triggers; the privileged schema owner remains a trusted
  operator and is NOT equivalent to unrestricted protection.
- Existing authorized revokeLicensedResource and revokeIssuerAuthority
  already perform withdrawal, fence and outbox in one transaction and
  can COMMIT. No relaxation of their source/issuer lock ordering.

### 0013 — Legacy NULL-SHA-256 Queue receipt recovery
- Historical completed receipts lacking an event digest are NOT valid
  proof of which event or routes were purged. Queue status with a
  canonical fingerprint and DLQ replay both deny such receipts;
  they are never silently upgraded or acknowledged.
- New cms_legacy_receipt_recovery_audit and constrained
  cms_claim_legacy_redrive SECURITY DEFINER function atomically
  log a one-time original receipt reset and operator ticket.
- A separate NOLOGIN tw_cms_legacy_recovery role has EXECUTE on this
  audited function but no raw receipt DELETE, publisher/grant,
  source/media/license or public content modification privileges.
  Production-like independent PG LOGIN accounts test these boundaries.
- Internal authorizeLegacyReceiptRedrive first reads the ORIGINAL
  immutable outbox event (not untrusted DLQ data), locks the legacy
  receipt, obtains an independent operator authorization callback,
  records an external audit, runs the narrowly-scoped SQL claim,
  resends the original canonical event to a Queue sender, and
  commits. Any send or commit failure yields NO DLQ ACK. The original
  legacy receipt remains on a rolled-back send failure. A second
  redrive attempt after successful commit cannot reset it again.
- A confirmed fresh purge and hashed completed receipt are required
  before the ordinary Queue consumer can ACK its redelivered event.
  The Queue send may race transaction commit; early consumer delivery
  fails closed and retries.

### Local Cloudflare Vite/vinext, R2 and Chromium
- Retained the TUR013 live LOCAL workerd (not Cloudflare Preview/deploy),
  cache.enabled=false, dynamic private/no-store and
  CDN-Cache-Control/Cloudflare-CDN-Cache-Control no-store.
- Strip conditional GET/HEAD request validators (If-None-Match,
  If-Modified-Since, If-Range) before local RSC/SSR handling to
  prevent an unsolicited HTTP 304 that could re-use a revoked page.
  Run 60 parallel adversarial conditional GETs against local workerd:
  no 304, no indexed/real/ad data, no-store 200/404. This does NOT
  prove a previously cached Cloudflare edge object was purged.
- 128 concurrent synthetic R2 image requests, exactly 64 successful
  original-PNG byte-verified reads and 64 revoked-during-stream
  404 denials; 48 modified-byte rejections 503, preserving no-store.
  Additional original TUR013 96+96 synthetic tests remain active.
- Five additional Chromium viewports 328/412/860/1216/1728,
  preserved 36 inherited browser suites plus synthetic rejected
  phone/news URLs, automated WCAG axe serious/critical, SEO noindex,
  inaccessible Ads scripts absent, 32 parallel localhost reads.
- No pnpm dependency updates, no new cloud account/bindings,
  no main merge, no public content.

## GitHub evidence and explicit proof boundary
An earlier code SHA with completed four-job PASS on TUR014 workflow is
linked in the final Pull Request evidence comment. The FINAL document
commit SHA must receive its OWN SUCCESS in all 12 inherited + TUR014
GitHub Actions workflows; report only those exact-HEAD IDs, job totals
and actual tests after they complete.

## No-go
No real Cloudflare Preview/deploy/Access, CDN cache invalidation, R2,
Queues/DLQ, Neon migration, live rights/license revocation or external
reviewer keys, domain, real news/phones/photos/specs/prices, merchant
feed, Google AdSense, licensing/trademark legal clearance, manual WCAG,
production capacity metrics or main merge. All data and media synthetic.
