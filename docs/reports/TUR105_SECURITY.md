# TOPWHIZ TUR105 — Security review and release NO-GO

**New negative evidence:** a signed media grant, unchanged ETag/If-Range and previously filled cache allow a deliberately unsafe HTTP/2 gateway to deliver four new fictional tail bytes as HTTP 206 AFTER revoke ACK. A separate deterministic origin pause shows that an already in-flight fill can complete and be cached after the revoke ACK. Cache purge and no-store were not tested on a real CDN. This is not an actual incident, R2 exposure, physical wire measurement or receiver ACK.

Guarded LOCAL countermodel rechecks generation on each cache hit and after asynchronous origin fetch, requires fail-closed authority availability, denies stale requests with 403 and rejects unsupported multi-range with 416. It does not implement independent immutable monotonic IAM, per-edge global fencing or revoke-safe cancellation of bytes already handed to transport.

Issue #22 remains OPEN and **HARD NO-GO**. Preserve TUR018 12 scenarios / 99,276 synthetic bytes, TUR019 cross-isolate bypass, TUR099 KID ABA, TUR100 session auth cache, TUR101 tenant authority, TUR102 queued receiver bytes, TUR103 signed redirect and TUR104 duplicate query. Maintain independent PG16 schema-owner/SECURITY DEFINER/CREATE ACL, actual pg.Pool and cancellation ownership, original canonical outbox SHA/route allowlist, parallel broker/Queue/DLQ uncertain COMMIT/lease, local vinext/workerd stale-cache, Chromium accessibility/SEO/perf, frozen pnpm and TUR002 AGPL/LGPL libvips gates.

No approval for production, TOPWHIZ/TOPWIZ trademark, third-party source/media rights or operator IAM. Do not merge main, deploy live Cloudflare/Neon/R2/CDN/Queue, purge cache, change DNS or publish actual content/prices/feeds/AdSense.
