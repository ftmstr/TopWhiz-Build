# TOPWHIZ — TUR007 Technical Delivery and Acceptance Report

Date: 2026-11-07
Repository: https://github.com/ftmstr/TopWhiz-Build
Branch: `feat/tur007-cms-e2e-r2-20261107`
Draft PR: https://github.com/ftmstr/TopWhiz-Build/pull/10
Parent: `feat/tur006-cms-transactions-workers-20261107` / Draft PR #9.
Status: **DRAFT / NO PUBLIC DEPLOY / NO MAIN MERGE**.

## Baseline verified

TUR006 Draft PR #9 was open and unmerged at SHA
`ae84269030d0e7d1c54ec029c5eb1de5b6c94e8e`.
Read `docs/TUR006_REPORT.md` and `docs/TUR006_CMS_OPERATIONS.md`.
Workflow https://github.com/ftmstr/TopWhiz-Build/actions/runs/42412422740
was completed SUCCESS. Inherited TUR002, TUR004 and TUR005 PR checks also PASS.

## Features implemented

1. `0005_cms_trusted_attestations.sql`: independent reviewer authorities
   (active, human/licensed_verifier); editor/originality/spec per-submission
   and per-revision attestation rows, license evidence and credited author.
   **Only an independently privileged reviewer role may insert these rows.**
   The database role policy has NOT been provisioned in production.
2. `independent-verifier.ts` reads attestation status, source permissions,
   media rights and the canonical content policy from PostgreSQL under lock;
   only issues a revision-scoped review grant after all checks pass.
   An AI message cannot claim itself to be an authorized grant.
3. `authorized-pipeline.ts` composes a stable external key, submission,
   trusted review, atomic PostgreSQL publish and durable outbox relay.
   Failed Queue sends return `pending_retry` while published snapshot and
   outbox event persist. This is an **unmounted adapter**, not a running cloud
   background worker or unrestricted publishing service.
4. `public-sql.mjs` centralizes parameterized, immutable-approved-only
   list/detail and media authorization SQL. The **same SQL strings** are used
   by Neon HTTP-backed Workers and PostgreSQL 16 CI tests. No draft disclosure.
5. `public-http.mjs` defines strict GET /v1/content?type=news|phone and
   GET /v1/content/news/<slug> or /phone/<slug> responses, 400/404 and no-store.
6. `media-reader.ts` / `media-handler.mjs`: R2 image GET is permitted only
   when an asset's database evidence is approved AND an active, currently
   published immutable news/phone version references it. Strict image key,
   digest metadata, byte length and MIME validation; no-store image delivery.
   Revoking the final published reference causes media access denial.
7. `apps/web/app/media/cms/[id]/route.ts`: same-origin Next.js proxy to the
   exact configured HTTPS CMS host; strict media-type/length checks, no
   redirects, no arbitrary user-provided proxy URLs. React news/phone
   components can render approved media without changing application code.
8. Existing upper/right/bottom labelled Ads locations remain inactive. The
   Google AdSense publisher/site IDs or scripts have NOT been added.

## Tests and evidence (final code before this report)

GitHub Actions https://github.com/ftmstr/TopWhiz-Build/actions/runs/42414312651
COMPLETED **SUCCESS**, three independent jobs:

- **cms-e2e**: 38/38 Node security/route/media/ad policy tests PASS;
  1/1 price & staging PostgreSQL integration PASS;
  1/1 inherited CMS publication/revision PostgreSQL integration PASS;
  1/1 new single-entry → independent attestation → public API → licensed R2
  → Queue retry → withdrawal PostgreSQL 16 E2E integration PASS.
  Frozen pnpm, TypeScript, Next.js build, two Wrangler dry-runs and vinext
  checker PASS. vinext checker: 95% (10 supported, 1 partial, 0 issues).
- **synthetic-site**: in CI workspace ONLY, write fictional local news and phone
  registry records, build Next.js, start local Next production server; five
  routes rendered plus missing-page 404, inactive Ad slots and no-config media
  denial confirmed. CI asserts the committed registry remains EMPTY.
- **api-to-nextjs**: creates TWO synthetic verified PostgreSQL content rows
  using independent SQL attestations/publisher; a CI-only Node fetch shim
  intercepts a nonexistent HTTPS hostname and executes the SAME PostgreSQL
  public API SQL/HTTP contract (not public Internet).
  Local Next.js server renders five real CMS-backed pages, R2-shaped image,
  and missing-content 404. The test is intentionally isolated; it does not
  establish externally reachable Cloudflare/Neon/R2 credentials or a true
  public HTTPS production environment.

These acceptance results are source/runtime CI evidence, not Cloudflare
production certification or a guarantee of merchant/source rights.

## Release gates remaining

- Separate production credentials, least-privilege PostgreSQL GRANT/REVOKE
  for intake, evidence signing, publisher and public reader; external identity
  provider & reviewer attestation issuer validation; threat model and audit.
- Real source/media rights records (not CI synthetic), independent verification
  service, editorial originality checks and revocation/takedown triggers.
- Provision Neon/PostgreSQL, R2 private bucket, Cloudflare Queues + DLQ,
  zone API scope, real image object review and origin/hostname credentials.
- Scheduled authenticated intake-to-verification trigger, deduplication and
  operational monitoring: not configured. CI workflow auto-verifies only
  artificially pre-attested content; AI **cannot grant itself permission**.
- Public Cloudflare Workers + Next.js vinext runtime preview, load/security
  tests and browser screenshot/accessibility review are NOT_RUN.
- Real license review, TOPWHIZ/TOPWIZ trademark clearance, AGPL compliance,
  branch protections, privacy/consent and AdSense approval are outstanding.
- No real product prices, retailer links, real photos, real news or user data
  created or published. All fictional records exist ONLY during isolated CI.
- No main merge, domain changes, live deploy or production advertisement.

## Official API references

- Cloudflare R2 Worker bindings:
  https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
- Cloudflare Queues retries:
  https://developers.cloudflare.com/queues/configuration/batching-retries/
- Cloudflare zone purge:
  https://developers.cloudflare.com/api/resources/cache/methods/purge/
- Neon serverless parameterized HTTP SQL:
  https://github.com/neondatabase/serverless/blob/main/CONFIG.md

## Suggested TUR008

Strict database role separation, trusted issuer identity and authenticated
attestation worker, Queue/DLQ scheduling and poison-message handling,
source/media rights revocation with audit, real R2 integrity scanning, test
Cloudflare vinext preview, browser a11y/SEO/performance QA. Keep PR Draft
until all release gates pass.
