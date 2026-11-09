# TOPWHIZ TUR033 technical report — 2026-11-09

Baseline exact TUR032 Draft PR #36 HEAD `ec6e90608683d6151727622e5d49425b8f87e123`: all 20 GitHub Actions workflows completed SUCCESS. TUR033 is stacked on that SHA. No production code, external assets, schema migrations, dependencies or lockfile modified.

## Implementation
New test imports **both existing, unmodified functions**: `services/prices-worker/src/cms/media-handler.mjs:handleCmsMedia` and `apps/web/app/media/cms/[id]/route.ts:GET`. A locally bound Node HTTP bridge invokes the real Next App Route GET. Only its outbound HTTPS `fetch` is stubbed to an exclusively fictional, fixed `cms.ci.invalid` host, routing into the actual CMS media handler; the in-memory R2-compatible substitute is staged using original structurally valid generated PNG, with metadata and actual SHA-256 verified by the CMS handler.

Real disposable PostgreSQL 16 creates two independent password-authenticated LOGIN roles with deny-by-default privileges. The test freezes (1) the final CMS SQL SELECT result after the query returned but before the CMS consumes the approved snapshot, and (2) the real Next GET Response after construction but before the local Node bridge writes HTTP output. A separately authenticated revoker COMMITs rights withdrawal and generation bump while each earlier authorized request is held. After resumption, the old request may still deliver the fictional PNG despite durable rights withdrawal. Fresh requests get 404, malformed IDs never reach CMS, and no-store headers do not retract prior responses.

This test **imports the real Next GET but does NOT start the full Next.js HTTP framework**. The SQL predicate is an isolated PG16 surrogate, not production Neon `cms_public_media`; no actual Cloudflare CDN/R2, proxy TLS, receiver ACK, last TCP byte or geographic purge was tested. Exact CI and terminal SHA must be verified independently before claiming test completion.

Engineering estimate: **63 / 100 weighted work-package points** — architecture 14/15, UI 12/20, services 19/25, security 9/20, CI 9/10, live deployment/legal 0/10. It is not an indication of production security, market launch readiness, or promised schedule. Issue #22 OPEN and release NO-GO.
