# TOPWHIZ TUR131 — Queue, DLQ, lease and unknown COMMIT recovery

The new real PostgreSQL16 wire-proxy suppresses a genuine COMMIT response while preserving the server's durable synthetic write. A client-visible TRANSPORT_UNKNOWN is reconciled by an independent fresh physical connection and a unique-key idempotent replay that inserts zero duplicate rows. A separate explicit ROLLBACK control inserts zero rows. This proves neither the actual Queue receiver ACK nor a crash/restart outbox lease: both remain NOT_TESTED. Never infer Queue delivery or media rights from a failed client COMMIT response.

Keep TUR030 ambiguous COMMIT, TUR018 original canonical outbox SHA/route allowlist and TUR017 parallel broker/Queue/DLQ/lease and idempotent recovery gates. Do not change original receipts, receiver lease ownership, route allowlist or media generation fence. Revocation after R2 publication still lacks distributed final-byte proof. Issue #22 OPEN / NO-GO.
