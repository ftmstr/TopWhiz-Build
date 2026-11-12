# TOPWHIZ TUR130 — Abort, unknown COMMIT and Queue/DLQ recovery limits

TUR130 verifies a deliberately aborted *uncommitted* PostgreSQL16 transaction: 23505 -> 25P02 -> real HTTP/2 RST_STREAM -> explicit ROLLBACK -> zero committed synthetic rows -> clean same-physical-backend B/C. Independent rights-admin REVOKE is acknowledged COMMIT. This is NOT a lost COMMIT ACK test, and not proof of crash/restart, original Queue receiver ACK, broker lease, R2/CDN response delivery or global cache invalidation.

An ambiguous COMMIT outcome must never be interpreted as successful rights authorization or safe Queue acknowledgment without independently authenticated monotonic durable state. The inherited TUR030 unknown-COMMIT tests, TUR018 immutable original outbox canonical SHA and route allowlist, TUR017 Queue/DLQ recovery, TUR119–122 stale HTTP/2 cache and existing lease/idempotency regressions remain mandatory. No original outbox, Queue, DLQ, lease, merchant, media or production data is mutated in TUR130.

Issue #22 OPEN / NO-GO; physical remote receiver final-byte guarantee NOT_PROVEN.