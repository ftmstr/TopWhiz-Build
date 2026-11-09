# TOPWHIZ TUR019 — Queue/DLQ and media rights reconciliation
Date 2026-11-09. CI synthetic only; production use prohibited.

1. Every historical completed NULL-SHA Queue purge receipt is
   QUARANTINED until independently reconciled with original outbox.
2. Accept no DLQ body as rights proof. Read original immutable
   cms_delivery_outbox UUID, submission UUID, positive revision,
   event type and <=10 allowed UTF-8 URL routes. Require SQL/JS
   canonical SHA agreement and time-limited independently issued
   grant before attempting old receipt reset.
3. Reject any named role/PUBLIC CREATE in trusted schema, dangerous
   SECURITY DEFINER search_path or missing immutable audit. Do not
   grant owner/superuser to broker, publisher or authorizer.
4. On parallel broker redemption, only one unused grant may be
   consumed, under transaction locks; log immutable outcome. A
   live processing lease is RETRY, never historical completion.
5. Queue accepted before SQL COMMIT is not a globally successful
   cache purge; if DB COMMIT response lost, do NOT ACK DLQ.
   Reconcile durable grant/audit/receipt and Queue result without
   fabricating exactly-once delivery.
6. Media: single-process fence can delay a rights COMMIT while
   enrolled local JS response streams drain/cancel. If callback
   fails, state must stay QUARANTINED. This is NOT sufficient to
   coordinate multiple Cloudflare isolates, other publishers or
   CDN-delivered bytes.
7. Issue #22 stays BLOCKING. Require a separate distributed
   coordinator, global invalidation and last-byte/transport
   threat-model acceptance; otherwise no media goes live.
8. AGPL/LGPL, source-photo, TOPWHIZ/TOPWIZ, operator IAM,
   CDN release and independent security/a11y review are all HOLD.

Do not publish actual content/images/offers or deploy.
