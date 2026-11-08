# TOPWHIZ TUR016 — CI-only grant provenance / schema-owner runbook
Date: 2026-11-09. DO NOT execute these operations on live production.

1. Before migration, identify the CMS schema owner and all direct and
   inherited schema CREATE grantees. PUBLIC=0 is insufficient: no non-owner
   principal may hold CREATE on a SECURITY DEFINER trusted path.
2. Use a reviewed standalone migrator in a disposable isolated database;
   do not grant owner, CREATEDB, CREATEROLE, superuser or BYPASSRLS to
   the intake, broker, reader, publisher or issuer services.
3. If any non-owner CREATE entry exists, BLOCK the migration; determine
   why the grant exists and obtain independent authorization to remove
   it. No blanket privilege change is performed by migration 0015.
4. The separate grant issuer's authenticated SESSION LOGIN must match
   cms_legacy_recovery_authorizations.issued_by and the server-side
   transaction issuance time must be used. Do not supply client-created
   issued_by/issued_at/consumed_at or attempt to reset an expired grant.
5. Verify the durable ORIGINAL outbox event, exact digest, operator
   ticket and expiry. A Queue/DLQ message body is NOT authoritative.
   The broker may execute one reset with a matching unused grant;
   it cannot create grants or delete arbitrary receipts.
6. Send the original canonical Queue message before recovery SQL
   COMMIT. On ambiguous COMMIT or lost response, DO NOT ACK DLQ;
   independently reconcile original outbox, grant consumption,
   recovery audit, hashed durable purge receipt and actual purge.
7. On active processing leases, retries and parallel DLQ work, fail
   closed and do not infer completion from a pre-TUR013 NULL digest.
8. Observe real zone-wide purge and external operator authorization in
   a separately approved future deployment; none is wired in this tur.

No third-party media, rights, real phone specs/prices/news, ads or
Cloudflare/Neon credentials are imported by this work.
