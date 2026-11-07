# TOPWHIZ TUR005 — Engineering and acceptance report

Date: 2026-11-07
Branch: feat/tur005-staging-postgres-frozen-20261107
Pull request: https://github.com/ftmstr/TopWhiz-Build/pull/8
Parent stacked Draft PR: https://github.com/ftmstr/TopWhiz-Build/pull/7

**STATUS: DEVELOPMENT DRAFT. NO MAIN MERGE / NO PUBLIC DEPLOY.**

## Verified input baseline

TUR004 PR #7 confirmed open/Draft, head be279575d212b78a83bc4d7891a266f809927cdf.
GitHub workflows 42403783149 and 42403783183 both completed/success
(before TUR005 was branched).

## Implemented in TUR005

1. Real PostgreSQL staging and quarantine:
   - SQL migration 0002, Drizzle tables, feed preflight checks, duplicate row
     quarantine with stable row index, merchant rights/verified host looked up
     from the database (never AI claims), source/price/tax/market/freshness checks.
   - No write/publish path to public price observations; no real retailer seeds.
   - Source batch unique key and database transaction enforce idempotence.
2. Locked dependencies: feature-branch-only lockfile bootstrap action generated
   pnpm-lock.yaml; strict --frozen-lockfile in independent TUR005 checks.
3. Actual PostgreSQL 16 CI service: SQL migrations + Drizzle inserts,
   database constraints, quarantine persistence and duplicate batch rejection.
   Third proposed CMS migration 0003 is tested in an isolated CI database,
   not applied in production.
4. Vinext 1.4.4 pinned compatibility checker for Next.js App Router:
   compatibility scan only, never vinext init or Cloudflare deploy.
5. User-requested page structure:
   - top horizontal, right desktop vertical, bottom horizontal ad placements;
     preview placeholders only, zero Google ad units/clicks.
   - /haberler and /haberler/[slug] generic news pages;
     /telefonlar and /telefonlar/[slug] generic catalog pages;
     homepage latest-news area and approved local media thumbnails.
   - intentionally empty approved-content registry; NO fabricated article,
     photo, retailer offer or phone specification.
6. Generic AI intake:
   - independently attested source/rights/media/spec/editorial checks;
   - quarantine failures, deterministic placement routing;
   - adapter contract for durable publish and cache invalidation.
   **No live reviewer, authenticated write API, Cloudflare Queue, R2, DB
   publisher, or remote content fetcher is wired; auto-publish is NOT LIVE.**

## Source/test evidence (after original feature implementation)

- https://github.com/ftmstr/TopWhiz-Build/actions/runs/42407183229
  completed/success at SHA 04120af712c7d71e9789c6cd1a00012257c3d38a.
  28/28 Node policy and structure tests and 1/1 actual PostgreSQL 16/Drizzle
  integration test passed; frozen install, typecheck, Next production build
  and Wrangler Worker dry-run passed.
- https://github.com/ftmstr/TopWhiz-Build/actions/runs/42407379318
  completed/success at SHA 800837bf78a390e4ab12410c7ff49a7297b99d3b.
  Regression after ad/media and duplicate quarantine refinements passed.
- Vinext scan reports 94% compatibility (7 supported, 1 partial,
  0 issues). Partial: reactStrictMode in App Router. This is NOT a vinext
  runtime build, browser proof or Cloudflare deployment.
- Later content migration integration test added: verify latest HEAD
  workflow separately before any readiness claim.

## Implementation limitations and no-go

- AdSense: requires approved account/site, consent/privacy compliance,
  official ad client IDs/units, mobile sizing and invalid-click controls.
  No ad code present.
- News/image AI: needs external independent approval attestations, protected
  database publishing, R2 image licensing and transformation, change audit,
  duplicate/correction workflows and automatic cache invalidation.
  Current package contracts only, not runnable production publishing.
- Real retailer data: no authorized live feed, direct seller purchase links,
  valid merchant credentials, affiliate agreements or real inventory in repo.
- PostgreSQL: only CI ephemeral container tested; no Neon account/db or
  production migration run.
- Cloudflare: Wrangler dry-run of price Worker only; Next website vinext
  runtime build and preview still NOT_RUN.
- Browser QA / accessibility keyboard and responsive screen capture NOT_RUN.
- Naming: TOPWHIZ/TOPWIZ registry clearance OPEN; asset rights and AGPL
  publication strategy OPEN; main branch protections OPEN.
- Frozen lockfile CI is present; separate dependency security/OSS license
  evaluation remains required before release.

Final acceptance demands a follow-on integration turn, authorized data source,
verified content rights, Cloudflare configuration and separate release review.
