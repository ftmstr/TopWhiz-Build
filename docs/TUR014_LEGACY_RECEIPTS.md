# TOPWHIZ TUR014 — Legacy Queue receipts and DLQ recovery runbook
DRAFT DESIGN ONLY; 2026-11-08, no production action authorized.

## Why the pre-TUR013 completed receipt is NOT trusted
A historical cms_purge_receipts row has status='completed' but
event_sha256 IS NULL. Its status proves neither the original event
body nor the Cloudflare zone purge outcome. Blindly filling a
hash from outbox and treating it as complete could ACK a never-purged
withdrawal and retain a stale licensed document in global cache.

## Explicit approved recovery workflow (currently synthetic)
1. Stop automation of legacy DLQ ACK, inventory all NULL-digest rows
   using a read-only service, and retain immutable source/outbox logs.
   Do not delete/approve in bulk. Keep live zone and domain offline.
2. Require an independent authenticated security/operator identity,
   a scoped ticket and actual canonical event in original CMS outbox.
   Check UUID, submission ID, revision, event_kind and routes.
3. Resolve status using makeReceiptStore.status(eventId,sha256). If
   the hash is NULL, fail with legacy_receipt_requires_independent_recovery.
   DLQ redrive MUST retry/retain the message and NEVER ACK completed.
4. Use a dedicated NOLOGIN legacy broker with constrained
   cms_claim_legacy_redrive SECURITY DEFINER function (not generic
   DELETE privilege). authorizeLegacyReceiptRedrive acquires row lock,
   confirms exactly a completed NULL-hash receipt, independently
   approves the ticket, writes audit BEFORE Queue send, claims
   the one-time reset in PostgreSQL, queues the ORIGINAL canonical
   outbox event and COMMITs. A Queue send failure rolls back reset.
5. A newly received event must pass original outbox authorization
   and claim a SHA-256-bound receipt, purge actual CDN, complete the
   receipt durably and ONLY THEN ACK. Cloudflare should be configured
   for bounded retries, DLQ and alerting in an authorized environment.
6. If a commit fails AFTER Queue acceptance, do not ACK; the redelivered
   Queue message retries while recovery is reconciled. At-least-once
   duplicates may purge again; no stale content may be declared gone
   without real CDN confirmation.
7. Keep original operator ticket/actor, event hash, audit and Queue
   acceptance evidence. The recovery audit does not constitute
   cryptographic proof that the real Cloudflare zone was purged.
8. A previously recovered event cannot be claimed again under the
   same event_id because of a UNIQUE(event_id) audit constraint.
   Use an independently authorized new event for any later action.
9. Verify publication fences deny revoked source and issuer pages
   at DB read and edge in actual private staging before public release.

## Failure matrix
- Missing outbox: refuse and retain DLQ event.
- Forged/invalid route/type/revision: refuse, log, never send/ACK.
- Receipt was already hashed: no legacy recovery; regular Queue
  idempotency rules apply.
- Receipt still processing: do not reset, honor active lease.
- Invalid operator ticket: no audit claim and no Queue send.
- External audit failure: no Queue send; rollback.
- Queue send failure: rollback ledger reset and audit.
- PostgreSQL COMMIT failure: no DLQ ACK, manual reconciliation;
  Queue may have received the event.
- Second racing operator: first succeeds; other operations refuse
  under row lock and immutable audit uniqueness.
- Local simulated success: not authorization to deploy.

No real Cloudflare/Neon/Access/AdSense or third-party data.
