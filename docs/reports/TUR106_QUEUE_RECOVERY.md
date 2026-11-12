# TOPWHIZ TUR106 — Queue recovery, original outbox and uncertain COMMIT

TUR106 changes no Queue/DLQ, database, migration, broker, route or receipt implementation. New HTTP/2 negative tests are synthetic and must not be interpreted as Queue recovery acceptance. Preserve original outbox canonical SHA and route allowlist, immutable original receipt, monotonic lease/epoch, idempotent retry, parallel broker and DLQ delivery, receiver ACK ambiguity, and unknown COMMIT after transport interruption. Never treat a retry or queue ACK as evidence of durable DB COMMIT or safe last-byte revocation.

Dedicated CI retains existing disposable PostgreSQL16 and canonical outbox/Queue regressions; success must be verified on exact final report HEAD. Independent local broker/Queue/DLQ and production R2/Cloudflare testing NOT_RUN. Any unresolved owner/IAM, stale receipt, COMMIT uncertainty, or post-revoke byte remains fail-closed NO-GO under Issue #22.
