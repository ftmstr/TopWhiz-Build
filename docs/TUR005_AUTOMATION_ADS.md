# TOPWHIZ TUR005 — Ads and structured auto-publication

Date 2026-11-07 | Status: Draft, NO commercial publication, live CMS or AdSense account.

## Fixed site advertising template

Three distinct non-clickable demo slots:
- TOP: responsive banner after navigation.
- RIGHT: reserved vertical desktop sidebar only; never overlays content, no mobile sticky ad.
- BOTTOM: responsive banner before footer.

No AdSense code, publisher ID or active advertising script. Production requires approved Google AdSense account, verified website, valid consent/privacy policy and appropriate official ad-unit IDs. AdSense distinguishes paid content from organic rankings and forbids accidental-click layouts. Google references:
https://support.google.com/adsense/answer/1346295
https://support.google.com/adsense/answer/10734935
https://support.google.com/publisherpolicies/answer/11169917
https://support.google.com/adsense/answer/9274019

## Canonical AI content contract and placement map

Authorized AI submits a standard structured payload; no per-story page coding:
- NEWS fields: type=news; slug, title, summary, original body, language, observedAt, verified source record IDs, approved cover media ID, author/revision metadata.
  Automatic destinations: /haberler/{slug}, /haberler, homepage latest news.
- PHONE fields: type=phone; slug, exact brand/model code/market, RAM/storage/warranty variants, approved specification source IDs, approved cover media ID.
  Automatic destinations: /telefonlar/{slug}, /telefonlar, comparison/catalog index.
- MEDIA: source/license verification, descriptive alt text and owned or licensed image derivative in future Cloudflare R2; store immutable keys, not arbitrary input URLs.
- PRICE: only independently licensed MerchantOffer feed; editorial AI cannot invent or overwrite store prices.

Staging -> independent verified rights, source, original writing, SKU, date and image checks -> QUARANTINED on failure OR READY_FOR_AUTO_PUBLISH on full pass -> durable publication and audit -> invalidate affected routes. AI-submitted claims of licensing, image ownership or verification NEVER count as approval; trusted backend reviews the actual permission source. High-impact conflicts and ambiguous variants require manual review.

Implementation: services/content/publish-policy.mjs and services/content/auto-publisher.mjs provide a tested deterministic admission/placement contract with injected independently trusted reviewer, durable storage and cache notifier adapters. These production adapters are NOT yet connected. A successful model submission cannot bypass rights, review or public deployment gates.

Next.js has reusable /haberler and /telefonlar listing/details templates, and an intentionally EMPTY apps/web/data/published-content.json registry. Therefore NO real automatically published pages. For truly immediate database-backed publishing without each Git commit, the next step is connect a protected CMS API, transactionally committed PostgreSQL content records, R2 verified media, a Queue consumer and route cache invalidation.

Proposed DB migration 0003_content_cms.sql is review-only. No migrations applied anywhere. Any content visible in preview must remain noindex until rights/trademark reviews and launch approval.

## Cloudflare and SEO plan

- Keep Next.js main app compatible with vinext after compatibility check; no vinext init/deploy executed in this turn without test evidence.
- Cron schedules authorized source imports and Cloudflare Queues handles processing with retry, idempotency and audit. Worker API publicly exposes GET only; content write API requires privileged credentials and separate authorization policy.
- For published original technology news, use NewsArticle structured data only after real article and dates/images verified; Google docs: https://developers.google.com/search/docs/appearance/structured-data/article
- No structured data for fictional news, demo prices or unlicensed images; no sponsored placement masquerading as cheapest option.

## Gates

- Authorized licensed third-party data sources and media rights
- Production CMS adapters, media processing, authenticated ingestion, rate limits, abuse controls, audit and reversible corrections
- Frozen lockfile installation and ephemeral PostgreSQL/Drizzle migration tests
- Responsive and keyboard browser QA, vinext build compatibility
- Actual approved AdSense account and verified publisher/site IDs
- TOPWHIZ/TOPWIZ trademark, AGPL strategy and main branch protection
- NO live deploy, domain connection, real prices, ads or fabricated news at TUR005
