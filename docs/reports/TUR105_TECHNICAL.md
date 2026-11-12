# TOPWHIZ TUR105 — HTTP/2 Range 206 cache-hit and delayed origin revocation (2026-11-12)

Canonical public repository: `ftmstr/TopWhiz-Build`. Preflight TUR104 Draft PR #110 exact HEAD `a8eaab9f4dc4a2ce88f43df069f014e872e36eec`, 19/19 first-page PR-triggered GitHub Actions SUCCESS; no TUR105 branch/PR existed. TUR105 stacked directly on that SHA.

Four NEW deterministic local Node.js 22.16.0 loopback h2c regressions use distinct gateway and origin HTTP/2 servers, signed synthetic asset-a generation tickets, an ETag and strict HTTP Range:
1. Unsafe gateway caches full eight-byte fictional object, serves initial 206 bytes 0–3, then serves a DIFFERENT 206 tail bytes 4–7 after generation-2 revoke ACK without contacting origin (origin fetch count remains 1).
2. Unsafe in-flight origin response is paused before fulfillment; revoke ACK precedes release; gateway still populates cache and delivers four fictional tail bytes after ACK.
3. Guarded local model checks current generation on every 206 cache hit and rejects stale grant / authority outage with HTTP 403, zero media bytes; canonical pre-revoke 206 requests still work.
4. Guarded local model checks again AFTER asynchronous origin fetch, rejects the post-ACK delayed response without populating cache, and rejects malformed multi-range with HTTP 416 and zero media bytes.

Local Node syntax PASS; initial 4/4 PASS; ten independent repeats 40/40 PASS. SHA-256 `9e4be6b4834b1f3b38ab6cd9cb7a97ce86db543e3deaf919eef99023748c6717`; exact Git blob `52012a6f8cd9a68b2fd17492f9303f58680dbf73` verified against locally tested bytes. The unsafe path is a deliberately vulnerable NEGATIVE MODEL, not deployed production code.

Dedicated Ubuntu 24.04 CI runs frozen pnpm, TUR099–104 historical HTTP/2 tests, disposable PG16 TUR096–098, SECDEF/schema ACL, canonical original outbox SHA/route allowlist, Queue/DLQ uncertain COMMIT/lease, and TUR002 AGPL/LGPL libvips/release hold. Final report HEAD CI must be independently checked: pending/failed tests are NOT PASS. No independent local PostgreSQL16, Chromium, vinext/workerd or remote R2/CDN physical last-wire verification in this turn (NOT_RUN).

Issue #22 OPEN / RELEASE NO-GO. TUR018 12 synthetic scenarios/99,276 bytes and TUR019 cross-isolate bypass remain. Engineering work-package estimate 75%, NOT production readiness. No main merge or live infrastructure.
