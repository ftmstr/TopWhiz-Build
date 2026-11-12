# TOPWHIZ TUR119 — 12 November 2026

Canonical Public repository: `ftmstr/TopWhiz-Build`. Parent TUR118 Draft PR #124 final HEAD `235bc7a703b6df6baf84c933a4ceecbd974489fd`, 19/19 actual PR-triggered GitHub Actions SUCCESS at that SHA. TUR119+ absent at preflight. TUR119 is stacked on that exact commit, not main. Parent TUR118 initial failing CI remains preserved as red evidence.

One new synthetic Node.js HTTP/2 adversarial test (Git blob `e8f71b2b436a5abbe28dc83832492a099145bdc2`), one frozen Ubuntu 24.04 workflow and four reports. An equivalent local prototype ran 6/6 successful invocations under Node 22.16.0. The committed source has not yet earned exact-final-HEAD CI acceptance at the time these reports were authored. Initial local prototype had an unhandled ECONNREFUSED on intentional authority outage; the harness was corrected without weakening the expected 403 denial.

Issue #22 remains OPEN / HARD NO-GO. Preserve TUR018's 12 scenarios and 99,276 fictional bytes of negative evidence, TUR019 cross-isolate bypass and earlier negative security findings. Remote R2/CDN receiver final byte/ACK, production request-scoped IAM, independent source rights and TOPWHIZ/TOPWIZ trademark approval are NOT PROVEN. Engineering work-package estimate 75% (NOT production readiness). No main merge or live Cloudflare/Neon/R2/CDN/Queue/cache purge/DNS, no real content/media/prices/merchant feeds or AdSense.

## New distinct HTTP/2 304 revocation TOCTOU test

Three actual local HTTP/2 servers model an independent rights authority, content-only origin and gateway. Both vulnerable and guarded gateway modes cache fictional four-byte `OLD!` at rights generation 1. Concurrent `If-None-Match` revalidations are held by the origin before its HTTP 304 replies. An independent rights-authority POST `/revoke` returns ACK at generation 2, approved=false, **before** the held 304 replies are released. The intentionally unsafe gateway treats content freshness as publication authorization and delivers 4 cached bytes after ACK. The guarded local model checks rights again after the 304 and before writing cached bytes; it returns 403 and zero body bytes. It also returns 403 when the authority is unavailable.

Expected exact test evidence: two real 304 responses, unsafePostAckBytes=4, safePostAckBytes=0, safe403AfterHeld304=true, safe403WhenAuthorityDown=true. This is distinct from TUR105 HTTP 206 Range and TUR106 stale cache-fill overwrite: HTTP 304 is bodyless content revalidation, not an extension of publication rights. It does NOT prove CDN final network-byte control or modify production delivery code.

The dedicated workflow reruns real disposable PG16 SECURITY DEFINER/owner/group ACL tests, independent IAM and pooled PID cancellation, HTTP2 regressions, original immutable outbox SHA, Queue/DLQ, unknown COMMIT, frozen pnpm and license holds. Existing vinext/workerd and Chromium a11y/SEO/perf workflows remain unmodified; their final SHA results must be checked separately.
