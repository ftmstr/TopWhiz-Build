# TOPWHIZ TUR017 — Legacy Queue, DLQ and digest preflight
Date: 2026-11-09. This is a CI threat model, not a live procedure.

1. Confirm independently authenticated grant authorizer and separate
   broker; no app role should own schema, have CREATEROLE/SUPERUSER,
   write arbitrary receipts or forge independent issuer credentials.
2. Retrieve ORIGINAL durable cms_delivery_outbox, not DLQ payload:
   event UUID, submission UUID, revision, type and allowlisted ordered
   unique routes. Compute canonical SHA-256 using independently
   reviewed JS and now PostgreSQL's internal function.
3. Reject pre-existing or new grants whose stored SHA differs from
   original outbox, even when event_id and operator ticket match.
4. Check trusted schema owner and every ACL grantee with CREATE,
   including named roles. Re-check on grant INSERT/consumption, not
   only at migration. Any drift => transaction fails closed.
5. Require a unique unconsumed grant issued_by actual DB session user,
   issued_at DB transaction timestamp and expiry at most 15 minutes.
   Ticket cryptographic validation and real dual control still missing.
6. If old receipt completed with NULL digest, never infer purge.
   Constrained broker claims one grant, appends immutable audit, resets
   old receipt and queues ORIGINAL event. On sending failure roll back.
7. On COMMIT success with lost response, do NOT ACK DLQ. Inspect
   outbox/grant/audit/receipt durable state and external Queue evidence.
   Distinguish Queue accepted from cache actually purged.
8. A parallel DLQ may send duplicates (at-least-once). Consumer checks
   immutable outbox plus exact digest, acquires ONE durable receipt
   lease, purges, persists completed receipt, only then ACKs. Active
   processing lease => RETRY, no forced historical reset.
9. On revocation verify real zone-wide cache purge across existing
   global zones through a separately authorized future operation.
   Local no-store workerd checks alone are NOT sufficient.

All TUR017 data/keys/images/tickets are fictional and isolated.
