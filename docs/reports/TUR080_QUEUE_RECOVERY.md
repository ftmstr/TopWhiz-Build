# TUR080 Queue recovery — unchanged controls
No Queue/broker/DLQ/outbox production changes. Original outbox canonical SHA and route allowlist remain required. Parallel brokers, uncertain COMMIT ACK, lease expiry, redelivery, immutable provenance, idempotency and recovery ownership remain fail-closed gates. This tour does not claim independent re-execution of those controls.
