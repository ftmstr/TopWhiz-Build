# TUR057 — Queue recovery invariants

No Queue, broker, DLQ or production outbox changes. Preserve original canonical outbox SHA, route allowlist, idempotent lease, parallel broker delivery, unknown COMMIT transport ambiguity, recovery provenance and revocation-generation monotonicity. Owner-controlled ACLs can compromise DB reader trust and thus downstream Queue provenance; this PG16-only ACL demonstration is not a broker recovery test. No live Queue or R2/CDN exercised. Existing recovery tests remain mandatory. Issue #22 OPEN, release NO-GO.
