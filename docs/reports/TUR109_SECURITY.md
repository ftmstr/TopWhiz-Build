# TOPWHIZ TUR109 — security evidence and hard NO-GO

Adversarial schedule: guardian evaluates a signed synthetic epoch-1 media access as allowed, withholds reply, then confirms epoch-2 revoke; the old positive reply arrives after ACK. A publisher that treats any old positive as a continuing grant emits four stale bytes. A test-only protected publisher revalidates after this asynchronous boundary, verifies echoed asset/epoch/request ID, denies epoch-1, and fails closed on guardian outage. An IPC ACK is not an authenticated, durable, globally ordered revocation receipt; a post-ACK recheck also cannot retract previously enqueued network bytes.

Retain TUR018 12 scenarios / 99,276 synthetic negative bytes, TUR019 cross-isolate bypass, TUR102 buffered final byte and TUR107 SECDEF/lease spoof negatives. Independent operator IAM, owner-vs-service separation, SECURITY DEFINER and CREATE ACL, pg_cancel_backend PID reuse and pooled lease authority, unknown COMMIT, CDN/R2 last-byte delivery, and rights revocation remain unresolved. Never grant pg_signal_backend, pg_read_all_stats, or superuser rights merely to pass a test.

Issue #22 OPEN. No new production media runtime, credentials, permissions, Cloudflare, database or real content. NO-GO until independent IAM, real network evidence, licensing, content provenance and TOPWHIZ/TOPWIZ clearance.
