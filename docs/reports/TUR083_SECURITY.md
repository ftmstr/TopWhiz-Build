# TUR083 Security — release NO-GO

Issue #22 remains OPEN: no independently verified proof of R2 rights revocation before the **last delivered network byte**, including already-open range responses, remote edge caches, multiple publisher processes and cross-isolate replay. TUR018's 12 scenarios / **99,276 synthetic post-revocation bytes** and TUR019's cross-isolate bypass are preserved as adverse evidence, not fixed. TUR083 demonstrates another distinct failure mode: process-local generation=2 acknowledgement in A does not fence process B still at generation=1, and B physically delivers four stale bytes.

A local IPC 'revoked' message, HTTP 206, Content-Range, no-store, socket close and local process shutdown cannot prove global edge invalidation, authentic receiver ACK or all-publisher revocation propagation. The experiment has no Cloudflare R2/CDN and is intentionally unsafe. No Issue #22 closure.

Release blockers remain independent owner/IAM approval, PostgreSQL16 SECURITY DEFINER/schema-owner/CREATE ACL and same-role pg_cancel_backend privilege, immutable original outbox canonical SHA/route allowlist, ambiguous COMMIT/lease and Queue/DLQ replay, vinext/workerd stale-cache, Chromium accessibility/SEO/perf and rights/source provenance. Require independent operator approval and TOPWHIZ/TOPWIZ trademark clearance. NO-GO even if all synthetic tests pass.
