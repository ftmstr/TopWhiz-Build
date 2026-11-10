# TUR067 — Queue recovery report
Keep original outbox canonical SHA, route allowlist, idempotent recovery and immutable provenance. Parallel broker/Queue/DLQ ACK loss, uncertain COMMIT, lease expiry, restart and replay remain release blockers until separately demonstrated.
Remote transport ACK is not equivalent to durable consumer COMMIT or authorization at delivery time. This tour changes no Queue implementation and runs no broker integration tests.
