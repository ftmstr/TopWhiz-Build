# TOPWHIZ TUR032 technical — 2026-11-09

## Baseline
TUR031 stacked Draft PR #35 exact SHA `96c5bf94fe3212389f392d3fcd7c9587898353ba`: 20/20 GitHub Actions workflow runs completed SUCCESS at that exact SHA. TUR032 is a separate stacked Draft PR; no changes to app runtime, migrations, lockfile, generated user content or deployment settings.

## New evidence
A disposable **real PostgreSQL16** container creates two independent password-login sessions (reader and rights revoker) and per-test isolated data. A locally staged, original synthetic **structurally valid PNG** is passed to the **actual** `services/prices-worker/src/cms/media-handler.mjs` through an in-memory R2 substitute, with actual SHA-256 and MIME/length verification. A local Node HTTP server transports the response bytes.

The first deterministic interleaving freezes the final database-approved snapshot **after the actual SQL SELECT** yet before the handler receives that result, commits withdrawal and generation increment from the independent revoker, and resumes the handler. The second freezes an actual completed `handleCmsMedia` Response before its local HTTP server starts writing, then commits withdrawal and resumes. Both preapproved paths can still deliver 200 with the complete fictional PNG after durable COMMIT, although new GET and HEAD are rejected (404). This reproduces the same class of gap in the real CMS handler, unlike TUR031's illustrative local handler. It is **negative evidence, not a mitigation**.

No claim that an HTTP client's consumed byte was transmitted after withdrawal at the TCP wire level; transport buffering, real R2/CDN, web Next.js proxy E2E, global cache invalidation and receiver ACK remain NOT_RUN/NOT_PROVEN.

## Release
Issue #22 OPEN. External IAM/owner prevention, media licensing, AGPL/LGPL, trademark and source approval remain unresolved. No main merge or live deployment. CI assertions require exact final HEAD success, not unverified future runs.

Engineering progress estimate: 61/100 weighted points (architecture 14/15; interface 12/20; services 18/25; security 8/20; CI 9/10; production/legal 0/10). This measures estimated implemented/verified engineering scope, not readiness. No publication until independently accepted blockers are resolved.
