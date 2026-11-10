# TUR051 Queue recovery report — 2026-11-10

ACK freshness is not a substitute for original outbox canonical SHA, route allowlist, broker/Queue/DLQ receipt provenance, lease fencing, idempotent replay, or uncertain COMMIT recovery. Isolated nonce ledgers permit cross-isolate replay; no distributed durable nonce ledger was implemented. Existing Queue/DLQ and PostgreSQL16 controls must continue running in inherited CI. No live broker or queue invoked. NO-GO.
