# TOPWHIZ TUR004 — Source Rights and Affiliate Feasibility

Research date: 2026-11-07.
**Status: source research only. No data/feed agreement, credentials, retailer
consent, pricing grant, affiliate approval or link tracking is established.**

## Official sources examined

| Candidate | Official primary documentation | Finding / gate |
|---|---|---|
| Cloudflare Workers + Hyperdrive | https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/ ; https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/ | Drizzle PostgreSQL works on Workers. This prototype uses Neon HTTP, while Hyperdrive + pg is a future alternative. No Cloudflare account configured here. |
| Trendyol Marketplace | https://developers.trendyol.com/ | Seller/partner API is for managing a participating merchant's own products/orders/inventory; **not** a public all-retailer price feed license. Need independent explicit data-sharing permission. |
| Trendyol Affiliate | https://www.trendyol.com/s/trendyol-affiliate-programi | Influencer/social-link program; terms exclude **mobile phones** from its stated commission model. Do not promise phone commissions. Eligibility of TOPWHIZ website and data rights unverified. |
| Hepsiburada Merchant | https://developers.hepsiburada.com/tr/companies/hepsiburada | Merchant/integrator portal; primarily maintains that merchant's listings, price, inventory/orders. No grant to aggregate rival offer prices is inferred. |
| Amazon Creators API | https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction ; https://affiliate-program.amazon.com/creatorsapi/docs/en-us/locale-reference ; https://affiliate-program.amazon.com/creatorsapi/docs/en-us/onboarding/sign-up-as-an-amazon-associate | Turkey marketplace is listed. Programmatic product catalog requires enrolled Associates status, qualifying sales/access approval and target marketplace Partner Tag; local terms limit how data may be used, cached or displayed. Nothing connected/approved. |
| Google Product snippets | https://developers.google.com/search/docs/appearance/structured-data/product-snippet | Third-party comparison site may consider product snippet / verified AggregateOffer only when page, variants and data are genuinely eligible. |
| Google merchant listing | https://developers.google.com/search/docs/appearance/structured-data/merchant-listing | **Not suitable for redirect-only comparison listings**: merchant listing pages must sell the item themselves. Do not claim TOPWHIZ merchant-listing eligibility. |

## Acquisition hierarchy (no live connectors yet)

1. Preferred: documented direct contract with retailer, authorized affiliate/network
   product feed or wholesaler with explicit **comparison, caching, derivative price
   display and direct-link permissions**, and rate/refresh requirements.
2. Conditional: Amazon Creators API **only** after target market enrolment,
   access, policy review and full technical compliance.
3. Market research lead only: third-party price aggregators (e.g. Akakçe, Cimri),
   public HTML pages and search-result snippets. A visible price is not a
   replication/republication license. No scraping of blocked pages.
4. Manual licensed import: allowed if supplier permission and provenance evidence
   recorded, with strict expiry, review and no artificial live-pricing claim.

## Commercial and consumer safeguards

- Separate organic cheapest-offer order from explicitly marked sponsored results.
- Unclear shipping, membership restriction, currency, warranty/SKU or taxes => no
  comparable ranking. Avoid suggesting "cheapest" over incomparable variants.
- Always show observed date/time, seller identity, coverage disclaimer and explicit
  commission/advertising relationship. Do not label asynchronous feed records "live".
- Every approved host/domain must be verified, including redirect destinations.
- Retain correction, revocation/takedown and audit records.
- No price data will be seeded to database or pushed into UI until a rights source,
  test feed and human approval are available.
- Legal review before commercial deployment: Turkish consumer protection,
  distance selling/advertising, KVKK, affiliate disclosures and platform terms.

## Recommended first licensed pilot

Seek one **contractually permitted** Turkish merchant feed with 5–20 distinct
manufacturer/model/SKU/market variants, confirm tax and shipping semantics, then
test with short-lived approval snapshots. Avoid mass ingestion before entitlement,
identity and quality checks.
