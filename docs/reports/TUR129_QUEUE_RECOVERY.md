# TOPWHIZ TUR129 — Transaction-local role expiry, Queue/DLQ and uncertain COMMIT

TUR129 includes an independently **acknowledged** SQL rights-admin REVOKE COMMIT while a second SQL transaction holds SET LOCAL ROLE, then A COMMIT and B/C same-backend readback of the broker identity. This is local PostgreSQL authorization behavior, NOT a lost COMMIT ACK, Queue consumer ACK, DLQ lease or remote receiver last-byte proof. Test has no production data, R2 media, price, original outbox or Queue mutations.

Inherited workflow retains TUR030 real unknown-COMMIT transport tests, TUR019 SECURITY DEFINER/CREATE ACL, TUR018 original immutable outbox SHA and canonical route, TUR017 Queue/DLQ recovery, TUR119–TUR122 post-ACK HTTP2 cached rights revocation and old fictional leak counters. Exact GitHub job evidence required. Issue #22 OPEN / RELEASE NO-GO.
