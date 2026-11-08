# TOPWHIZ TUR013 — Fail-closed queue/cache recovery and rollback
Status: FUTURE authorized staging plan; nothing deployed now.

1. Require independent authenticated operator/ticket and verified
   source, media, editorial/Ed25519 issuer identities before publishing.
2. Audit a disposable database copy first: match selected immutable
   publication head, source/media dependencies and outbox ledger.
   Do not backfill a published fence without durable event proof.
3. Apply migrations 0010 and 0011 only with approved isolated
   operator credentials, trusted schema search_path and locked
   role DDL. New receipts bind to event SHA-256; inspect and drain
   NULL-hash legacy Queue/DLQ deliveries before cutover.
4. Verify API and vinext Worker pre-handler cache disabled, dynamic
   HTTP no-store and both CDN headers. Static robots must remain
   Disallow: / and no live ad or real content.
5. On revoke/rollback, commit active head, revised generation,
   rights/issuer state, audit and outbox in the SAME transaction.
   Verify cms_public_pages denies invalid version and exposes only
   the authorized generation.
6. Outbox relay accepts only immutable event. Outbox status
   delivered marks Queue accepted; never claim CDN invalidated yet.
7. Consumer verifies original event fields in the DB, computes
   canonical SHA-256, claims durable receipt, PURGES globally and
   commits receipt completion. Only then ACK. Failed DB/Cloudflare
   API/lease returns retry with backoff then a configured DLQ.
8. DLQ redrive requires original durable event AND external
   verified human operator ticket AND audit-before-send.
   Never use Queue self-reported authority.
9. Media access must recheck rights after verifying R2 bytes and
   immediately before response; fail with 404/503, no-store.
10. Real CDN objects created by earlier software can remain cached
    regardless of new no-store headers. Explicit live-zone purge,
    monitoring, Access route-deny and multi-region evidence are
    mandatory before considering public release.
11. In an emergency disable ingest, stop Queue publications,
    revoke compromised issuer/source rights and deny routes at
    the Worker/edge before attempting cache recovery. Preserve
    immutable audits; no restored pages without new independent review.
12. Do not merge TUR013 Draft PR, deploy Cloudflare Preview,
    register domains, import real feeds/prices or activate AdSense.

Current state: Only ephemeral GitHub CI and local workerd;
no credentials, production data, external media or real CDN calls.
