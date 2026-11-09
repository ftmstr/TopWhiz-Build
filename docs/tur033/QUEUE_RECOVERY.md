# TUR033 Queue recovery

No changes to Queue, DLQ, broker, outbox or lease runtime. The TUR018 canonical original outbox SHA/route allowlist and TUR017 parallel recovery regression remain required in this workflow. Unknown COMMIT ACK must be reconciled from durable database state; no retry should infer success from broker ACK. TUR029–032 real PostgreSQL negative tests remain in the new workflow. Production multi-broker and actual network final-byte proof NOT_RUN; NO-GO.
