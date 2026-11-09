# TUR032 Queue / DLQ recovery — inherited gates, NO-GO

No Queue transport, broker, lease, outbox, database migration, settlement token or cryptographic receipt changed. Existing tests for original canonical outbox SHA, issuer/route allowlist, independent PostgreSQL sessions, COMMIT ACK ambiguity, parallel consumer/DLQ lease and replay remain required. TUR030's lost client transport after COMMIT dispatch can be committed or absent; readback does not imply remote Queue/receiver acceptance.

TUR032 adds a new boundary: a durable committed rights withdrawal does not retract an already approved CMS response. It provides no ordered or durable CDN purge ACK. No Queue/DLQ/R2 live actions performed. Global queue/purge exactly-once remains NOT_PROVEN. All release gates NO-GO.
