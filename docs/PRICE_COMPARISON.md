# TOPWHIZ — retailer price comparison / TUR003

**Status:** prototype only. This branch contains fictional devices, merchants and prices. No real retailer API, feed, link, database or deploy is connected. Keep this stacked PR in Draft; no merge or commercial launch without clearance gates.

## User intent

For an exactly identified device variant, show merchant, verifiable cash price, mandatory shipping, total price, currency, territory, availability, observed timestamp, retailer link, and affiliate/sponsorship disclosure. Sort organic offers by comparable **total price**. User can open the retailer's original product page; TOPWHIZ does not process checkout.

## Data entities (target PostgreSQL/Drizzle schema, not implemented)

- `Merchant`: stable ID, legal/store display name, verified allowed domains, market, feed/API contract and permission status.
- `MerchantOffer`: merchant offer ID, stable `DeviceVariant` FK (model, storage, region, new/refurbished, warranty/import status), merchant FK, product URL, currency, territory, `price_minor`, `shipping_minor` or unknown, tax-inclusive flag, stock, conditions/limits, affiliate flag, and `verified/published/stale/quarantined` state.
- `PriceObservation`: offer FK, observed UTC timestamp, source snapshot/reference, capture method, price and shipping components, retrieval status, approval/audit metadata. Preserve history rather than overwriting observations.
- `MerchantLinkAudit`: permitted endpoint/domain, destination validation, affiliate disclosure, last checked time. Never allow arbitrary user-provided redirect destinations.

All amounts are integer minor currency units in the backend; demo UI uses decimal TRY values only. Reject missing variant identity or incompatible tax/shipping basis. Enforce unique merchant offer identity, idempotent feed ingestion, source rate limits, audit logs and human review of conflicts.

## Safe ingestion plan

1. Prefer **authorized retailer/affiliate feeds** or bilateral merchant partnerships for price and product URLs. Do not confuse a seller's marketplace management API with a general public competitor-pricing API.
2. Automated tasks ingest to staging, reconcile model number/GTIN/storage/color/warranty/region, validate currency/tax/shipping, then record source and observation time.
3. Publish only approved and recent comparable offers. If feed expires or becomes inaccessible, show "last observed" and eventually withdraw organic lowest-price status rather than claim live prices.
4. Link directly to verified HTTPS merchant product URLs, subject to merchant-domain allowlisting, redirect review and `rel="sponsored"` for commission links. Never forge pricing or redirect users through opaque trackers.
5. Disclose methodology, covered retailers (not necessarily all stores), affiliate relationships, paid placements and exclusions. Sponsor placements must be explicitly labeled and separate from organic ranking.
6. Protect privacy and credentials. Never commit store API tokens to the public GitHub repository.
7. Before activating real prices, review contracts, Turkish advertising rules, data rights, warranties, deceptive discount rules, merchant naming and brand rights.

## Product / SEO

- Unique canonical device model/variant page with mobile-first price offers, comparable totals and visible timestamps.
- Price history graph, location-aware stock/delivery only when proven, price alerts only after consent/privacy implementation.
- Google Product snippets + eligible AggregateOffer metadata only for **actual verified offers** and matching visible page content; demo and unverified offers must not create Product offer structured data.
- Track organic clicks, outbound merchant clicks, freshness coverage, mismatch corrections, affiliate conversion where contractually available.

## Acceptance gates

- [x] Explicitly fictional demo offers with no live external links
- [x] Selection, basic sorting, total-price display and empty state (source implementation; browser QA not claimed)
- [x] Deterministic data integrity tests added (execution must be proven by CI)
- [ ] Verified permitted feed/source and merchant agreement
- [ ] Backend schema, ingestion, validation and publish state machine
- [ ] Link validation, security audit, freshness thresholds and visual/browser testing
- [ ] Turkish advertising and affiliate disclosure legal review
- [ ] Rights/trademark/license clearance, Cloudflare preview and production gates
