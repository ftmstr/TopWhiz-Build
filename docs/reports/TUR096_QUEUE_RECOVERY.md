# TOPWHIZ TUR096 — Queue/DLQ, original immutable outbox SHA, uncertain COMMIT (NO-GO)

No changes to runtime database schemas or owners, signed original outbox canonical SHA and allowlisted paths, external Queue/DLQ broker, lease fencing, retry idempotency, receiver ACK or CDN/R2 publication. The new real PG16 test proves separate owner/reader roles with local guardian generation-2 acknowledged COMMIT; that COMMIT is **not** a remote Queue ACK or last-byte CDN delivery proof.

Dedicated CI explicitly reruns inherited real PG16 TUR030 transport-disconnected unknown-COMMIT durable CAS, TUR019 SECURITY DEFINER/CREATE ACL and safe schema, TUR018 canonical route and original SHA, TUR017 broker/lease/DLQ races; these are reruns, not new recovery implementations. Separate login authority remains mandatory for guardian and media. Issue #22 OPEN; release NO-GO. No external Queue, Neon/R2/CDN or production assets used.
