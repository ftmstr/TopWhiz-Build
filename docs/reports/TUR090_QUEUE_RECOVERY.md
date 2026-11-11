# TOPWHIZ TUR090 — Queue/DLQ/original outbox recovery — NO-GO

This TUR adds only synthetic local HTTP/2 restart tests, one read-only CI workflow and reports. PostgreSQL16, external broker, Queue/DLQ, R2 and workerd are NOT_RUN locally and unchanged. A child-process restart or local generation file is not a PostgreSQL COMMIT, durable Queue receipt, authenticated consumer ACK, CDN purge or final-byte delivery guarantee.

Preserve immutable original outbox canonical SHA and strict route allowlist. Require independent issuer/guardian/schema-owner/operator IAM, SECURITY DEFINER safe search_path and CREATE ACL boundaries. Continue adversarial parallel broker/Queue/DLQ ambiguous COMMIT/ACK-loss, crash/restart, replay, lease ABA and fencing, original outbox digest, idempotent retry, monotonic rights revocation and fail-closed uncertainty tests. Earlier successful CI cannot be represented as new local Queue recovery execution. Issue #22 OPEN. NO-GO.
