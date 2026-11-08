# TOPWHIZ TUR010 — Browser / SEO / Cloudflare Workerd QA matrix

CI workflow: .github/workflows/tur010-acceptance.yml
Stacked Draft PR #13. Exact branch feature only.

## CI suites

1. security-and-build — pnpm --frozen-lockfile, strict package pins, inherited
   Node tests, seven independent PostgreSQL integration scripts, Next build,
   vinext local App Router build, static compat scan, two Worker --dry-run
   bundles. Database credentials are ephemeral GitHub Actions localhost only.
2. local-workerd — Wrangler dev --local --ip 127.0.0.1 --port 8789 starts
   real workerd on ephemeral runner; local HTTP probe validates GET /health,
   denied POST, malformed price query, empty offers 503 without production
   DB, inaccessible CMS/R2 503, arbitrary route 404, no leaked secrets.
3. chromium-mobile-accessibility — real PostgreSQL seeded with TWO independently
   signed fictional records, valid self-generated PNG, local HTTPS-CMS
   API simulation limited to hostname cms.ci.invalid (no internet host).
   Next production server starts on localhost:3109 and Playwright Chromium
   exercises five routes x desktop 1440/mobile 390 = ten cases plus
   automated axe (two cases) and robots/404 (two cases) = 14.
   Screenshot files, traces and HTML reports are uploaded as a seven-day
   GitHub Actions artifact; screenshot contents are fictional CI-only.

## Enforced acceptance points

- Main page, news index/detail, phone index/detail return HTTP 200 and display
  true CI PostgreSQL data, including approved synthetic media where linked.
- Phone/news SEO: correct title/description, preview robots disallow all,
  X-Robots-Tag noindex, no invented canonical URL.
- Main ARIA landmark and H1, skip navigation, 390px viewport no horizontal
  scroll, visible mobile editorial nav; visible right rail at 1440px.
- Three ad placement DOM nodes preserved, NO adsbygoogle.js code.
- axe WCAG 2/2.1 A/AA tagging, no SERIOUS or CRITICAL findings; this does
  NOT certify WCAG conformance.
- Not-found article HTTP 404. Image naturalWidth >0 proves actual Chromium
  PNG decode rather than mere fetch/metadata validation.
- No production account tokens/merchant prices/news/photos.

## Remaining checks before any public launch

Manual screen reader + focus-order journey, keyboard-only navigation, user
testing at 320/360/390/768/1440px, performance budgets, WCAG full review,
image EXIF/privacy and AV, lawful source credits, language and navigation,
Google search structured-data eligibility, consent/ad-label legal review,
actual Cloudflare vinext workerd and CDN purge in a distinct private test
account, Cloudflare Access and protected domain. NO DEPLOY.
