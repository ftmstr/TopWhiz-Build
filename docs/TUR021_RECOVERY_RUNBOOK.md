# TOPWHIZ TUR021 — Durable media fence and Queue/DLQ recovery (CI only)
Date 2026-11-09. NOT a production operation or authority.

1. Verify real original immutable cms_delivery_outbox event ID,
   submission UUID, positive revision, event type and <=10
   allowlisted routes. Compute original SQL/JS SHA equivalence.
   DLQ payload alone and historical completed NULL-SHA receipts
   cannot certify any original/global cache purge.
2. Verify trusted migrator/schema owner, no named/PUBLIC CREATE
   drift and SECURITY DEFINER pg_catalog/trusted/pg_temp search
   path. Reject forged grants, issuers and tickets. Broker,
   reviewer and authorizer remain least privilege and separate.
3. Queue send accepted but database COMMIT response lost:
   NO DLQ ACK. Read back original outbox/grant/recovery audit,
   active consumer lease and actual Queue state; do not claim
   exactly once or reissue a consumed one-time grant.
4. Media prototype: a trusted migrator manually enrolls a
   fictional rights-approved media ID with generation 1. A
   limited reader acquires a per-asset opaque capability through
   a PostgreSQL row lock. A limited revoker begins revoke with
   the expected generation: all new admissions must be denied.
5. If any local stream permits remain, a revoke COMMIT must
   fail closed; a timeout, dead reader or guessed ack is not
   proof of network delivery. No auto-expiry is permitted to
   assert last-byte completion.
6. Upon verified **test-local** permit termination, commit
   cms_media_assets rights=false plus generation++ atomically.
   COMMIT ACK lost: re-read DB REVOKED state before any retry.
   Pre-COMMIT crash/ROLLBACK: REVOKING persists with no new
   admissions; reconcile and retry original capability only.
   Never auto-reopen on uncertainty.
7. Unknown/out-of-band owner writes bypass this prototype;
   still-open Issue #22 requires real global ingress,
   distributed operator authority, R2/CDN cache invalidation,
   downstream transport semantics and independent human
   security/rights review.
8. Preserve AGPL/LGPL native dependency, TOPWHIZ/TOPWIZ,
   image/source/merchant, consent and protected main gates.
   Cloudflare R2/Queue/DLQ, Neon/prod PG, CDN and AdSense
   are NOT_RUN in this synthetic tour.

Any uncertainty -> HOLD / NO-GO. No production rollouts.
