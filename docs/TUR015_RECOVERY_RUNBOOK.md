# TOPWHIZ TUR015 — Queue/DLQ and concurrent revocation operational runbook
Date 2026-11-08. NOT an approved real deployment procedure.
All supplied state is fabricated, isolated and non-public.

## Prerequisite authorization
An independently verified security officer must establish a
real IAM identity, expiring ticket, exact original durable CMS
outbox event (eventId, routes, submissionId, revision, kind),
canonical SHA-256 and scoped authority to re-purge. A SEPARATE
recovery authorization issuer can write a one-time expiring
grant. The legacy broker has no INSERT rights to authorizations,
nor generic DELETE/UPDATE access to arbitrary Queue receipts.
Production IAM, vaults, Cloudflare bindings and approval workflows
are not yet configured.

## Fail-closed old NULL-hash completed receipt
1. Quarantine a legacy receipt whose event_sha256 is NULL;
   never interpret old status=completed as proof of a purge.
2. Verify original outbox event and source/reviewer rights
   independently. Never accept event payload or authority from
   the DLQ message body.
3. Independent grant issuer writes an exact event/digest/operator/
   ticket authorization expiring in <=15 minutes. Ticket and
   issuer proof must come from a separately controlled system.
4. The broker locks the actual receipt row under trusted
   SECURITY DEFINER path, validates and consumes the independent
   grant, writes one immutable audit record and deletes only the
   original completed NULL-hash receipt in a single transaction.
5. External audit must succeed before Queue send. Send the
   ORIGINAL canonical event to origin Queue, then COMMIT.
6. If sending fails, roll back. If COMMIT raises or its response
   is lost, NEVER ACK a DLQ item just because Queue accepted it;
   review original outbox, consumed grant, audit and real receipt.
7. Consumer verifies original durable outbox and canonical digest,
   waits for valid receipt lease, performs actual zone purge,
   persists completion and THEN ACKs. Lost lease/DB/purge triggers
   bounded retry and later a monitored DLQ in a real setup.
8. If Queue receives an event before the recovering transaction
   commits, it may block on a PG row lock; it must not ACK based
   on the old NULL hash. Redelivery is safe only as at-least-once,
   not as proof of exactly-once external side effects.
9. Active processing lease remains processing and requires a
   retry; it is not a completed receipt and cannot be reset
   as a historical old completed row.
10. Require direct real Cloudflare cache evidence across zones
    before declaring a revoked article gone from the internet.

## Simultaneous multiple source/issuer revocation
1. Preflight impacted ACTIVE immutable published HEADs and all
   their source/media and issuer dependencies.
2. Restrict writes to dedicated rights/issuer roles and a
   trusted PostgreSQL schema. Never use database owner or
   superuser credentials inside intake/AI/HTTP processes.
3. Begin transaction. Lock authoritative license/issuer before
   submission rows; deterministically order affected records.
   Write state=withdrawn, monotonic fence, removed public routes,
   durable withdrawn outbox and mutation ledger audit together.
4. On deadlock/serialization/deferred-gate conflict, rollback
   entire transaction and bounded retry; do not treat partial
   approval as successful revocation. Record attempts.
5. Assert one withdrawal outbox per affected publication;
   the audit ledger may contain multiple rows for one story
   with both revoked sources.
6. Verify READ-only public view denies the revoked records and
   independent cache invalidation has actually completed.

## Current NO-GO
No production PostgreSQL migration, Cloudflare Preview/deploy,
Access, real CDN purge, Queue/DLQ/R2 bucket, domain, real news,
phone specs/images/prices, merchant feed, AdSense or main merge.
Legal and trademark rights remain unapproved.
