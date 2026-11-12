# TOPWHIZ TUR132 — Distinguish SQL CommandComplete ROLLBACK from missing COMMIT response

Acknowledged SQL COMMIT query after 23505/25P02 transaction failure can return actual PostgreSQL ROLLBACK command tag; TUR132 asserts **0** durable rows. By contrast inherited real TUR131 proxy suppresses server COMMIT ACK on TCP while server commits one row: client TRANSPORT_UNKNOWN but independent durable readback finds exactly one. Promise resolution, SQL command tag, transport ACK and broker/Queue receiver ACK are distinct. Unknown durable status requires authenticated reconciliation with immutable outbox SHA and idempotency, not a blind replay.

Inherited TUR030, TUR019, TUR018 original immutable outbox SHA, TUR017 Queue/DLQ and HTTP2 post-revocation guards remain untouched; no production Queue, DLQ, R2 or CDN mutations. Historical synthetic byte counters are preserved. Issue #22 OPEN; release NO-GO.
