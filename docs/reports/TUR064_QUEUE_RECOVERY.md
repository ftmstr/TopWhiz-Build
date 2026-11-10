# TUR064 Queue and recovery — inherited gates

No Queue/worker/outbox production mutation. Preserve original canonical outbox SHA, route allowlist, immutable original receipt, parallel broker/Queue/DLQ lease and unknown COMMIT uncertainty; no claimed remote receiver ACK. A locally queued response is not evidence of delivered final bytes. Original TUR030 and downstream regression workflows remain mandatory. NO-GO.

---

## Additional independent CMS/PG16 HTTP integration evidence

# TUR064 — Queue/DLQ, COMMIT uncertainty and final receiver boundary

Actual disposable PG16 guardian revocation COMMIT is confirmed in the new test before the pending earlier CMS 200 response writes HTTP bytes. The response still delivers the fictional PNG. COMMIT ACK from the guardian transaction is not a producer/Queue ACK, DLQ lease, durable outbox receipt, HTTP cancellation result, CDN purge receipt or terminal byte ACK from a receiver.

TUR064 does not change original outbox SHA-256 or Queue/DLQ/lease implementation. The CI explicitly inherits TUR017/TUR018 original SHA/canonical recovery, TUR029/030 independent logins + uncertain COMMIT readback, TUR053 aborted HTTP, TUR060 SECDEF/CREATE ACL, TUR062 unguarded negative and TUR063 guarded Next positive tests. Live broker leases, multi-region replication, Cloudflare edge invalidation, external cancellation semantics, post-last-byte client ACK and rollback-revocation epoch fencing remain NOT RUN / NOT PROVEN. Historical TUR018 12 schedules and 99,276 fictional unsafe bytes remain tracked.

Keep Issue #22 open, default deny and RELEASE NO-GO. Never treat local PostgreSQL success as an end-to-end revocation/final-byte guarantee.
