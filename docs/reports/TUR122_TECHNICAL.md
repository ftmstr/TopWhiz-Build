# TOPWHIZ TUR122 — Technical report — 12 November 2026

## Provenance and scope
Public `ftmstr/TopWhiz-Build` only. Parent TUR121 Draft PR #127 HEAD `f4749954ff170a25c77abee47e5c0d124932d4f6`; 19/19 first-page PR-triggered workflow runs and 56/56 first-page jobs independently verified SUCCESS before this TUR. Parent compare against TUR120: 6 ahead, 0 behind. TUR122 absent from searched open/all PRs and matching branch names at preflight. New stacked branch is based exactly on TUR121 HEAD.

## Distinct adversarial contribution
TUR121 demonstrated two-layer stale HTTP 304 promotion with separate held origin responses. TUR122 tests **single-flight in-flight promise coalescing across tenants**: two A revalidations are held at real localhost HTTP/2 origin, rights transition ACK revokes A and advances B to generation 2, then a new B request arrives *after ACK* and joins the **same old A HTTP 304 promise** in an intentionally unsafe gateway. The unsafe fixture returns fictional AOLD to B (4 wrong-tenant bytes), and A also receives four stale bytes after ACK. A guarded local fixture scopes L1/L2 and in-flight keys to tenant, asset and rights generation; it rechecks rights after awaiting origin, denies A HTTP 403, delivers BNEW to B and fails closed on authority outage.

The scenario uses three disposable localhost HTTP/2 servers and no real R2/CDN, Queue, merchant, customer or licensed media. The unsafe fixture is a negative witness, not production implementation. Local Node22 prototype was exercised 10/10 successfully; the exact committed file and final report commit require real GitHub Actions verification before claiming CI PASS.

## Preservation and acceptance
Dedicated TUR122 GitHub Actions uses frozen pnpm, disposable PG16, inherited SECURITY DEFINER/schema-owner/CREATE ACL and role tests, physical HTTP/2 RST and independent IAM, original canonical outbox SHA/route allowlist, uncertain COMMIT/Queue/DLQ/lease, TUR121 HTTP/2 regression, and TUR002 AGPL/LGPL/libvips release gates. Existing vinext/workerd and Chromium a11y/SEO/performance workflows remain unchanged. No production fix or dependency change.

**Issue #22 OPEN / NO-GO**. TUR018: 12 negative interleavings, 99,276 fictional PNG bytes; TUR019 cross-isolate bypass remains. Actual remote last receiver byte, independent IAM and approvals remain NOT_PROVEN. No main merge, live deployment, cache purge or real content/feeds. Engineering work-package estimate **75%** (not production readiness).
