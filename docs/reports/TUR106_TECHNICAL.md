# TOPWHIZ TUR106 — Concurrent HTTP/2 origin fills, revoke ACK and stale cache overwrite (2026-11-12)

Public repository `ftmstr/TopWhiz-Build`; stacked on TUR105 Draft PR #111 exact HEAD `dbc4f1fd971cd62116bff1017dbcfb9b52e6ffc5`. At preflight, 19/19 first-page PR-triggered Actions for TUR105 completed SUCCESS; TUR106 branch/PR did not exist. New changes are limited to one Node.js built-in h2c regression file, one dedicated Ubuntu 24.04 CI workflow and four reports.

Four new deterministic local Node.js 22.16.0 tests use a real loopback HTTP/2 gateway, a separate loopback HTTP/2 origin and explicit barriers. Fictional generation-1 `OLD!` and generation-2 `NEW!` four-byte bodies are NOT third-party media:

1. Unsafe model: generation-1 origin response is held; generation-2 revoke ACK is observed; fresh generation-2 fill caches `NEW!`; releasing stale origin overwrites cache with `OLD!`, and a CURRENT generation-2 signed request receives `OLD!` without a new origin fetch.
2. Guarded local countermodel: after-await generation validation rejects held stale response with HTTP 403, preserving generation-2 `NEW!` cache and subsequent authorized reads.
3. Two simultaneous held generation-1 fills are released separately after ACK and a generation-2 fill; both are rejected and neither overwrites newer cache.
4. Guarded cache-hit rejects duplicate grants, tampered HMAC and authority outage with HTTP 403 and no additional origin requests.

Local syntax PASS, first execution 4/4 PASS, 10 repeated executions 40/40 PASS. New test SHA-256 `dc2df635d99285b72aa337329ea3ad9bf4b8c7b74025c18482e869bac3c63e2a`; local Git blob `ed94dd4a30af04e1f4b55e3ca3253a1c148b56dc`. GitHub blob was verified to match. The unsafe branch is deliberately vulnerable negative evidence, not deployed code.

Dedicated CI includes frozen pnpm, TUR099–105 HTTP/2 regressions, disposable PostgreSQL16 TUR096–098, SECURITY DEFINER/schema-owner/CREATE ACL, original outbox canonical SHA and route allowlist, Queue/DLQ uncertain COMMIT and lease, and TUR002 AGPL/LGPL libvips/release hold. Do not call CI PASS before final report HEAD Actions complete. Independent local PostgreSQL16, Chromium, vinext/workerd and real remote R2/CDN physical last-wire verification were NOT_RUN in this turn.

Issue #22 OPEN and release NO-GO. Preserve TUR018's 12 synthetic scenarios/99,276 bytes and TUR019 cross-isolate bypass. Engineering work-package estimate remains 75% (not production readiness). No main merge or live infrastructure.
