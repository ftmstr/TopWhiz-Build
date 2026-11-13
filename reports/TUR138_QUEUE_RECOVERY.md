# TOPWHIZ TUR138 QUEUE_RECOVERY

Original outbox canonical SHA and route allowlist must be retained. Concurrent broker/Queue/DLQ uncertain COMMIT, lease takeover, receiver ACK, idempotent retry and replay of revoked media are NOT independently proven by this TUR138 test. Existing regression workflows must remain successful; no Queue messages sent.

Work-package progress estimate: 75% (not production readiness).
