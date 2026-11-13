# TUR147 Queue and recovery — NO-GO

The new test does not exercise a real broker, Queue, DLQ, lease, receiver ACK, restart or uncertain PostgreSQL COMMIT. Preserve original outbox canonical SHA and route allowlist; reject unknown routes and altered receipts; keep idempotent lease and parallel broker recovery boundaries. A revoked or unknown authority must not be treated as a replay grant. Existing Queue/DLQ workflows are historical CI evidence only, not independently rerun in this turn. No production Queue/R2/Neon actions.
