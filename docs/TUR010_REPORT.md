# TOPWHIZ TUR010 — Development and Evidence Report
Date: 2026-11-08
Repository: https://github.com/ftmstr/TopWhiz-Build
Branch: feat/tur010-vinext-workerd-accessibility-20261108
Stacked Draft PR: https://github.com/ftmstr/TopWhiz-Build/pull/13
Parent: TUR009 Draft PR #12, commit 829f13fef482f4df7ba81ec6ca1229c5edac3871.

## Verified baseline

TUR009 PR #12 was open, Draft, not merged. Read TUR009_REPORT.md,
TUR009_SECURITY_REVIEW.md and TUR009_VINEXT_Wrangler.md in its exact branch.
All seven inherited GitHub Actions workflows on parent HEAD were completed
SUCCESS: TUR002, 004, 005, 006, 007, 008 and 009. No main merge.

## Delivered in TUR010

1. apps/web/package.json pins react, react-dom and
   react-server-dom-webpack 19.3.1 plus @vitejs/plugin-rsc 0.5.39,
   vinext 1.4.4, Playwright 1.65.0 and @axe-core/playwright 4.14.0.
   Next.js 16.4.5 and Node 22 remain unchanged. The branch-only, write-scoped
   lockfile regeneration workflow resolved dependencies without running
   lifecycle scripts; it was deleted after pnpm-lock.yaml was updated.
   All subsequent installs use pnpm --frozen-lockfile.
2. Existing Next.js production build and reproducible vinext App Router RSC,
   server/client/SSR build now run on the same pinned workspace. The Vite
   config remains LOCAL, with no Cloudflare adapter or deployment credentials.
3. A real ephemeral Cloudflare workerd process runs with Wrangler 4.135.0
   and compatibility_date 2026-09-25 (the newest date supported by the
   pinned workerd binary). Localhost HTTP tests verify health/read-only,
   method rejection, invalid variant rejection, safe no-DB zero-offer 503,
   no-CMS/no-R2 503 and 404. The original config date 2026-11-07 exceeded
   the pinned binary and was corrected after CI detected the failure.
4. Source-approved synthetic PostgreSQL news/phone and original CRC-valid
   RGBA images flow into actual Next production site via the exact-host,
   CI-only database-backed CMS HTTP contract. Chromium covers 390px and
   1440px layouts, homepage, news/phone listings and detail pages,
   404 behavior, locally rendered media, upper/right/bottom inactive
   advertising slots, navigation, no horizontal overflow and no real AdSense.
   Site screenshot/HTML/trace evidence is retained as an Actions artifact
   for seven days (only synthetic content).
5. Accessibility: editorial templates add keyboard skip link, stable main
   landmark, a visible mobile navigation menu, focus rings and responsive
   specification-table overflow. Playwright runs axe WCAG 2A/AA and 2.1A/AA
   tags, failing on any SERIOUS/CRITICAL findings. Automated checks are
   not a substitute for full manual WCAG review.
6. SEO preview safety: root noindex/nofollow/noarchive header; generated
   robots.txt Disallow:/; static news/phone index titles and dynamic
   article/model title and description. No canonical hostname or sitemap
   invented while domain/rights clearance remains open. Media alt text is
   preserved by CMS API parsing.
7. Issuer identity security: the immutable published-version issuer
   dependency now records the exact verified Ed25519 signature as well as
   its key. Public projection denies any later signature substitution,
   including nonempty replacement signatures; issuer reconciler withdraws
   the page with durable CDN purge outbox.
8. Eight REAL isolated PostgreSQL LOGIN sessions are retested with
   additional cross-role denial scenarios. DLQ tests also cover forged
   self-approved messages, audit callback downtime, active receipt lease
   and duplicate messages in one batch. No production privileges are used.

## Verified acceptance evidence

Preliminary full TUR010 CI https://github.com/ftmstr/TopWhiz-Build/actions/runs/42478773360
completed SUCCESS (all three independent jobs):
- Security/build: frozen dependency install, 45 prior unit tests,
  7 independent PostgreSQL integrations, Next/TypeScript, vinext RSC build,
  compatibility check and two Wrangler dry-runs.
- Local workerd: actual workerd localhost HTTP negative/positive acceptance.
- Chromium: 14/14 Playwright tests PASS with synthetic PostgreSQL news and
  phone, images, mobile overflow, SEO, ads, axe and 404. Evidence artifact
  stored in GitHub Actions.
Later commits added +3 DLQ tests and exact-signature tamper/reconciliation
acceptance. The current HEAD after this report requires a fresh successful
CI; DO NOT infer that an earlier run covers later commits.

## Release blockers and explicit boundaries

- No Cloudflare vinext App Router code has yet executed IN workerd;
  local workerd proof covers the public read-only price/CMS Worker;
  frozen vinext proof covers local Node/Vite RSC and Next build separately.
- No Cloudflare Access, real preview URL, prod Worker, production Neon
  identities, R2 buckets or Queue/DLQ; no real issuer private keys and
  rights contracts or actual CDN purge evidence.
- No real news, phones, real merchant price offers, affiliate content,
  copyrighted media or active Google AdSense. TOPWHIZ/TOPWIZ mark and AGPL,
  data privacy and licensed sources still require external clearance.
- No manual screen-reader/keyboard usability, image full decoder/antivirus,
  load/performance/security penetration or production deployment proof.
- main remains unchanged. Keep PR #13 Draft; no merge, live Preview,
  domain change or deployment.

## Next TUR011 gates

A fully isolated local vinext-on-workerd Vite adapter, locked dependency
security/license scanning, dedicated test Cloudflare bindings with
zero production secrets, browser performance/responsive/assistive technology
manual review, cache revocation race/load/visibility experiments,
no-publication proof and branch protection/rights clearance.
