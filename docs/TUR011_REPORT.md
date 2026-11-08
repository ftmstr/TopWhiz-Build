# TOPWHIZ TUR011 — Technical development report
Date: 2026-11-08
Repository: https://github.com/ftmstr/TopWhiz-Build
Parent: TUR010 Draft PR #13, c555f78d39255617507efbcf2066432350567349
Branch: feat/tur011-local-vinext-workerd-races-20261108
Draft PR #14: https://github.com/ftmstr/TopWhiz-Build/pull/14

## Baseline
PR #13 open, Draft, not merged. Three TUR010 technical/security/browser
reports re-read. Exactly 8 inherited workflows on that commit are
completed/success: TUR002, 004, 005, 006, 007, 008, 009 and 010.

## Code delivered
1. Pinned Cloudflare Vite plugin 1.67.0, Wrangler 4.158.0 and Vite 8.3.6,
   reusing React/RSC 19.3.1 and vinext 1.4.4. Branch-only one-time
   lockfile resolving workflow (no lifecycle scripts) was deleted after
   the matching pnpm-lock.yaml was saved. All normal jobs frozen-install.
2. Isolated web Vite config uses Cloudflare RSC/SSR child environments,
   remoteBindings=false, compatibility_date 2026-09-25 and workers_dev=false.
   Explicit local Worker entry forwards to vinext/server/fetch-handler.
   No production Vite config, DNS, service binding or account modification.
3. Real local Cloudflare workerd execution through the Cloudflare Vite
   plugin: full production build, Vite preview on 127.0.0.1:3116,
   HTTP checks for home, news, phones, robots.txt, unpublished content 404,
   noindex and inactive upper/right/bottom ad placeholders. First attempts
   returned 404 because the Worker entry was missing; the explicit fetch
   handler fixed the issue.
4. PostgreSQL CI concurrency: 12 rights-dependent synthetic published
   stories, eight parallel source-license revokers, eight independently
   signed synthetic issuer publications, six parallel issuer revokers,
   32 concurrent durable Queue receipt claims and 16 good/16 tampered
   synthetic R2-like PNG reads. Requires exact outbox delivery invariants.
   No real Cloudflare, merchant, news or licensed production images.
5. Real Playwright Chromium expanded to widths 320/360/390/768/1440/1920.
   Mobile/tablet overflow, keyboard skip focus, axe WCAG A/AA severe findings,
   noindex SEO, image decoding and local-only DOMContentLoaded budget checks.
   768px exposed hero orbit and crowded header; both were corrected.
6. Production dependency audit and third-party license inventories
   are recorded as short-retention CI artifacts. A legal-review BLOCKER
   remains open for two LGPL-3.0-or-later sharp-libvips binary components.
   No legal clearance is inferred from CI success.
7. Detailed recovery/rollback and security evidence in TUR011 documents.

## Evidence
Initial local actual vinext workerd HTML success was recorded on
GitHub Actions run 42480558304 at earlier branch SHA
af7350030e062fe5c236fa38aa564ab666ec5600.
Initial 7 PostgreSQL inherited + one stress integration success
occurred in run 42480491714, whose separate browser/workerd jobs failed.
These are preliminary, not final HEAD acceptance.

The last commit after this document must have its own GitHub CI checked.
Store exact commit, workflow run URLs and 4-job conclusions in PR #14
comments only after independent verification.

## Remaining blockers
No real workerd deployment/Cloudflare Preview, Cloudflare Access,
production or test Cloudflare account resources, real CDN cache
invalidations, rights and independent signer secret vault, real R2 bucket,
Queues/DLQ or third-party media feeds. No actual AdSense, news,
phones, prices or merchant partner import. TOPWHIZ/TOPWIZ mark,
AGPL and LGPL third-party obligations, SEO public indexing, production
security/performance and manual screen-reader QA remain unapproved.
Do not merge into main or deploy.
