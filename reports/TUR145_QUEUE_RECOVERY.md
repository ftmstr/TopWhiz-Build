# TUR145 Queue recovery report — 2026-11-13
No Queue/DLQ implementation mutation in TUR145. Preserve original outbox canonical SHA, issuer/route allowlist, broker redelivery, lease epochs, uncertain COMMIT, receipt ACK, and idempotent retry fail-closed semantics.
Synthetic HTTP/2 epoch is not a durable Queue lease nor an R2 authorization mechanism.
Real parallel broker/Queue/DLQ recovery and independent PostgreSQL16 IAM reruns NOT_RUN in this tur.
