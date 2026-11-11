# TOPWHIZ TUR100 — HTTP/2 connection-auth cache revocation and cross-asset scope (2026-11-12)

Canonical Public ftmstr/TopWhiz-Build only. Parent TUR099 Draft PR #105 exact HEAD `1378b031c2630d6ba951a1c7d31000748b2e8441`, 19/19 first-page PR-triggered GitHub Actions SUCCESS verified at preflight. TUR100 absent from PR and branch searches. Stacked branch starts from parent exact HEAD, not main.

**Novel adversarial test:** Child-process Node.js HTTP/2 server on 127.0.0.1 caches one successful HMAC authorization at the connection level. After epoch 1→2 rotation ACK, a second stream on the same session delivers **four new synthetic bytes**, while a fresh session rejects the same revoked grant with HTTP 403. Connection-level cache also permits a token scoped to asset A to fetch asset B (**four synthetic B bytes**). Contrasting per-stream epoch/key/asset verification denies stale grant, forged epoch-2 claim with old key, cross-asset access and authority outage with HTTP 403. This is test-only; no real independent authority, R2/CDN final-byte or remote receiver ACK proof.

New test `services/prices-worker/tests/tur100-http2-session-auth-cache.test.mjs` uses Node built-ins only. Local Node 22.16.0 syntax PASS; initial 4/4 PASS; 10 independent repetitions 40/40 PASS. SHA-256 `1baaaf8565faef0ebc536c9cf4704d5ff27f0f52b3bab09dac41a76988131424`. No production code/dependency changes.

Dedicated Ubuntu 24.04 workflow preserves TUR099 HTTP/2, disposable PG16 TUR096–098, TUR030 unknown COMMIT, TUR019 SECDEF/CREATE ACL, TUR018 canonical outbox SHA/route allowlist, TUR017 Queue/DLQ and TUR002 frozen pnpm/AGPL/LGPL/libvips release holds. Existing true local vinext/workerd and Chromium mobile/desktop a11y/SEO/performance CI unchanged; independent local reruns NOT_RUN. Final SHA CI must be checked, never inferred from local results.

TUR018 12 scenarios/99,276 negative synthetic bytes and TUR019 cross-isolate bypass preserved. Issue #22 OPEN; release NO-GO. Engineering work-package estimate 75%, NOT production readiness. No main merge or live Cloudflare/Neon/R2/Queue/CDN/cache purge/DNS/real content, images, prices, merchant feeds or AdSense.
