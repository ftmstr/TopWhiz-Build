# TOPWHIZ — TUR004 Price Engine / Backend Delivery

Date: 2026-11-07 | Worktree branch: feat/tur004-price-api-drizzle-20261107
Stacked on Draft PR #6, itself stacked on Draft PR #5 and foundation.
Status: **DRAFT — no live deployment, no database provisioned, no authorized feed connected**.

## CI precondition checked

TUR003 PR #6 head bb0a958a0a44d61507f184673b4d3405a9f5bc2e:
GitHub Actions run 42403011718: completed success. Install, Node tests,
TypeScript and Next.js build succeeded. This is not browser QA or a production approval.

## Delivery

- Isolated Cloudflare Workers GET-only price API (services/prices-worker).
- Drizzle ORM/PostgreSQL schema: strict device variants, merchants, verified
  domains, offers and append-only price observations.
- Read access through Neon HTTP driver; binding \`DATABASE_URL\` is a future
  Cloudflare encrypted secret, not a repository value.
- Versioned endpoint GET /v1/prices?variantId=<UUID>&market=TR, health endpoint.
- Validation, exact seller-host allowlist, HTTPS-only direct links, stale price
  quarantine, shipping-inclusive deterministic ranking, no unlicensed source.
- Evidence and permission-gated publication, affiliate program approval
  prerequisite, six-hour maximum source freshness. After it expires, an
  offer is excluded, not shown as a current/live price.
- Safe empty 503 responses if no database is configured or query fails;
  response does not disclose connection strings or raw database errors.
- Pure unit and structural tests; deployment build dry-run CI required.
- Manually authored PostgreSQL migration 0001 (not applied anywhere).

## HTTP contract

GET /v1/prices?variantId=11111111-1111-4111-8111-111111111111&market=TR

No database: HTTP 503 {"status":"not_configured","offers":[],"priceBasis":"product_plus_mandatory_shipping","market":"TR","currency":"TRY"}.

Configured with approved data: HTTP 200
{"status":"ok","offers":[{"offerId":"uuid","deviceVariantId":"uuid",
"merchant":"verified display name","productPriceMinor":100000,
"mandatoryShippingMinor":0,"totalPriceMinor":100000,"currency":"TRY",
"market":"TR","stock":"available","observedAt":"UTC ISO","purchaseUrl":"https://approved-store.example.com/...",
"affiliate":false}], "freshnessMaxHours":6, ...}.

**Values in the contract are examples of shape, NOT retailer observations.**
All prices are integer minor units (kuruş) and include tax + known mandatory
shipping before being ranked. Conditional campaigns/member discounts are not
mixed with regular public prices.

## Security and publishing rules

- No automated or public POST / PATCH / DELETE; grants to the backend should
  be SELECT-only. Publishing requires a future separately authenticated admin
  and review workflow, rights agreements, dual verification and audit.
- Merchant rightsStatus=approved with evidence, offer published, newest received
  observation verified, taxes included, stock available, known shipping, source
  ref, and collection method licensed.
- Public URL is checked against merchant-verified exact host (not suffix);
  no http, localhost, IP spoofing, userinfo, nonstandard port or fragments.
  **Note**: Merchant-domain verification is human/evidence-driven and MUST be
  established before setting status 'verified'; hostname validation is not a
  substitute for verifying merchant ownership and redirect behavior.
- Server does not fetch untrusted URLs. Outbound link redirects at the store
  remain an external risk; implement redirect/destination monitoring and
  safe merchant approval before first live link.
- Private feed tokens / LICENSE ref contents stay outside the public API and
  repository. No structured data with fictional offers.
- Use Cloudflare WAF/rate limiting, monitoring, and key rotation during deployment.
- Real-world catalog page and API require same-origin routing or explicit
  restricted cross-origin policy, not wildcard CORS.
- Display clear third-party price disclaimer, updated-at, affiliate status and
  store coverage statement. Sponsored listings must remain separate from organic
  price order and labelled; any commissions require applicable programs/agreements.
- Product identity must not merge different markets, RAM/storage, warranty,
  new/used or refurbished variants. No source rights presumed from public HTML.

## Local checks (not yet evidence of execution)

\`\`\`sh
pnpm install --no-frozen-lockfile
pnpm test
pnpm typecheck
pnpm --filter @topwhiz/prices-worker build:check
\`\`\`

The inherited pnpm lockfile issue remains open; frozen installs, dependency
inventory, licensed sources, link auditing, real PostgreSQL integration tests,
vinext compatibility and Cloudflare preview must pass before production.
**Dry-run is bundling validation only, NOT live Workers execution**.

## No-go

Do not merge to main or deploy while TOPWHIZ/TOPWIZ naming clearance,
AGPL licensing review, source-rights review, branch protections, production
secrets, browser QA and legally required disclosures remain unresolved.
