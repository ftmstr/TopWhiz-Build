# TUR031 Queue/DLQ / uncertain COMMIT — inherited HOLD

TUR031 does not introduce a new Queue, DLQ, broker lease, outbox message or recovery token. Separate PG16 rights revocation COMMIT in this turn is not a broker ACK or a global byte-receipt. The original immutable canonical outbox SHA, issuer/route allowlist, parallel broker and lease controls, idempotent retry, and uncertain COMMIT reconciliation are inherited and MUST remain CI-gated.

TUR030's real client transport-cut may leave server COMMIT either durable or absent; readback is required and cannot establish exactly-once broker dispatch. Transaction rollback, concurrent rights generation, owner ACL bypass, crash/restart, cross-isolate cached publisher and final-byte barriers remain distinct layers and must not be conflated.

This test does not exercise live Queue/DLQ/R2, multi-broker concurrency or receiver ACK: NOT_RUN. No actual cloud execution, retry or dispatch authorized. RELEASE NO-GO.
