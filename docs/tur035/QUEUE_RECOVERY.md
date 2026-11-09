# TUR035 — Queue / DLQ recovery

No broker, outbox, lease or Queue production code changed. Inherited CI reruns canonical original outbox SHA/route allowlist and Queue/DLQ recovery suites. Parallel broker ambiguity, uncertain COMMIT, retry and lease fencing remain distinct from the local Next streaming cancellation test. A broker ACK or durable DB COMMIT is not proof of final byte delivered. Real Cloudflare Queue/DLQ, crash recovery and production Neon were NOT_RUN. Release NO-GO.
