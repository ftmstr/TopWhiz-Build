# TUR083 Queue recovery — NO-GO

No production Queue, broker, DLQ, database, media route or original outbox code changed. The test's local IPC generation acknowledgement is **not** an original-outbox receipt, not a Queue consumer ACK and not a global delivery guarantee. An old publisher process can retain generation=1 while another reports generation=2.

Preserve strict canonical original outbox SHA and route allowlist, immutable signed receipt provenance, independent rights owner/SQL roles, fail-closed revocation generation, parallel broker lease ownership, unknown COMMIT outcome, duplicate delivery, idempotent retry, DLQ recovery, lost ACK and monotonic generation fencing. Neither replay nor a local ACK may re-authorize a revoked generation. Actual PostgreSQL16, Queue/DLQ and workerd acceptance was **NOT_RUN locally** in this turn; only GitHub final SHA checks may provide CI evidence. No live Queue/Cloudflare/Neon operation.
