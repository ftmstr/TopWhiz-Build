# TUR082 Queue recovery — unchanged release gates

No Queue, broker, DLQ, original outbox or database production change. Immutable original outbox canonical SHA, strict route allowlist, independent rights owner, concurrent broker lease, ambiguous COMMIT ACK, idempotent retry, monotonic generation, DLQ replay and receiver ACK provenance remain fail-closed. A per-range HTTP response ACK is not an outbox or global delivery receipt. This tour did not independently rerun PostgreSQL16, Queue/DLQ or workerd acceptance locally; require actual final GitHub Actions CI evidence.
