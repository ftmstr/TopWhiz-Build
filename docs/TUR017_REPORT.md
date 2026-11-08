# TOPWHIZ TUR017 — Technical / acceptance report
Date: 2026-11-09
Public repo: ftmstr/TopWhiz-Build (AGPL-3.0)
Branch: feat/tur017-outbox-digest-acl-dlq-r2-20261109
Parent: TUR016 OPEN/DRAFT/unmerged PR #19 at exact commit
5ef8f1bf19f69be1e214da921431e3834e92db80
Target: stacked TUR017 OPEN/DRAFT PR #20, not main.

## Baseline
Four TUR016 documents were directly read back. All 14 parent-HEAD
GitHub Actions executions completed SUCCESS (12 inherited runs and two
TUR016 push/PR runs). Main remained at
71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6.
No data/production access, secrets or domain resources were used.

## New code
- CI-only migration 0016 adds an internal canonical PostgreSQL 16
  SHA-256 over the *original* cms_delivery_outbox event ID, submission
  UUID, revision, kind and ordered-unique route array. Its JSON encoding
  mirrors validatePurgeEvent/fingerprintPurgeEvent in JS.
- The authorization row must match this authoritative digest at INSERT
  and consumption UPDATE. Pre-existing forged grants are NOT
  grandfathered into unverified purge completion.
- The new SECURITY DEFINER digest routine verifies its own trusted
  schema owner and expanded ACL CREATE grants on every invocation.
  A new non-owner or PUBLIC CREATE grant after deployment invalidates
  grant minting and consumption until independently reconciled.
  search_path pins pg_catalog, migrator-owned schema and pg_temp LAST.
- Real ephemeral PostgreSQL 16 integration exercises three SQL-vs-JS
  canonical event digests (including a duplicate route), an old forged
  grant, runtime schema ACL drift, 12 parallel broker claims, 8 separate
  parallel DLQ sends, durable idempotent purge, a forged DLQ route and
  active-lease denial.
- Node suite adds a 32-stream original PNG barrier; revocation occurs
  while each stream is partly consumed but before final rights lookup,
  requiring 404 and 0 response bytes. Post-final-response TOCTOU remains
  explicitly unresolved.
- Local vinext/workerd adds 144 conditional/ETag/Range/no-store HTTP
  probes. New real Chromium accepts 3 additional viewport widths,
  disabled third-party ad slots, noindex, 404 revoked routes, keyboard
  skip-link and automated axe severe/critical checks.
- New 4-job TUR017 GitHub CI; all inherited workflows retained.
  Existing frozen pnpm-lock and dependencies untouched.

## Failure and repair record
First code-head PG CI found a **test fixture mistake**, not an
authorization bypass: changing a synthetic receipt from completed to
processing must also clear completed_at, per inherited database CHECK.
Repair commit 1a58b126eb607e550d925515c821aca46b66398e
cleared completed_at in the test setup; no security constraints relaxed.

## Exact-final-HEAD evidence
Reports are committed after the code. The *final report commit* needs
its own fresh GitHub Actions verification; never treat an older code-head
run as final proof. Link CI run IDs and job logs in PR #20 commentary
only after all expected workflows have completed, and identify any
path-filtered workflow as NOT_RUN.

## Stop conditions
No main merge or Cloudflare Preview/deploy/Access, real R2/Queue/DLQ,
zone cache purge, Neon/prod PG migration or credentials, DNS/domain,
real news/phone/device prices/images/merchant feeds or AdSense.
No fake license/trademark approval; no manual WCAG or production LCP
certification. TUR017 security does NOT prove distributed exactly-once.
