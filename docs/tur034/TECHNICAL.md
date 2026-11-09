# TOPWHIZ TUR034 technical report — 2026-11-09

**Canonical parent** TUR033 Draft PR #37 HEAD `38fee4382018a032777d0bf94d1956d29a3ffa83` (20/20 GitHub Actions SUCCESS). PR #37 tests Range/conditional HTTP surfaces; TUR034 instead tests the actual CMS-to-Next proxy post-revocation delivery chain. An accidentally concurrent TUR033 Draft PR #38 was CLOSED unmerged to prevent duplicate tour numbers. TUR034 is a separate stacked PR based exactly on #37.

## New boundary
The test imports BOTH existing, unchanged functions: `services/prices-worker/src/cms/media-handler.mjs:handleCmsMedia` and `apps/web/app/media/cms/[id]/route.ts:GET`. Node's local HTTP bridge uses the original Next GET function; its outbound HTTPS fetch is intercepted only for `cms.ci.invalid` and invokes the genuine CMS handler with an in-memory R2 surrogate. An original, structurally valid synthetic PNG is SHA-256 and metadata checked. Two independent disposable PostgreSQL16 password LOGIN roles provide read and revoke privileges.

Two independent real COMMIT cuts: (1) final approved SQL SELECT result frozen before the CMS handler receives it; (2) actual Next GET Response held after construction, before local HTTP output. Both demonstrate that previously admitted responses can deliver 200 with all fictional bytes after committed withdrawal. Fresh GET returns 404, invalid IDs are rejected before upstream, no-store cannot retract old bytes. Neither represents a real security fix.

**NOT_RUN/NOT_PROVEN**: full Next.js HTTP runtime, actual Neon security-barrier view, remote Cloudflare Worker/R2/CDN, global purge, last TCP byte, receiver ACK, independent owner IAM, production source rights. No application runtime, schema, lockfile or dependencies modified. Exact final-HEAD GitHub CI results required.

Subjective engineering progress estimate **63/100**: architecture 14/15, UI 12/20, backend 19/25, security evidence 9/20, CI 9/10, live/legal 0/10; not production readiness. Issue #22 OPEN; RELEASE NO-GO.
