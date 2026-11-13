# TUR142 Queue / recovery
No production Queue, broker, DLQ, lease or outbox mutation. Preserve original outbox canonical SHA and route allowlist; ambiguous COMMIT, parallel broker/lease, replay, DLQ ACK and idempotent recovery must remain fail-closed. This test does not certify Queue recovery. Keep Issue #22 OPEN and release NO-GO.
