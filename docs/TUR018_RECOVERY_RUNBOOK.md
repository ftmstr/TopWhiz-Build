# TOPWHIZ TUR018 — CI-only Queue/DLQ/rights recovery runbook
Date 2026-11-09. Not approved for production execution.

1. Quarantine old receipts with completed status and NULL SHA.
   Never treat them as evidence of successful real cache purge.
2. Read the ORIGINAL immutable CMS outbox, never user/DLQ body.
   Validate event UUID, submission UUID, revision, kind and routes.
3. Accept only 0–10 route entries, all strings <=255 chars,
   and '/', '/karsilastir', '/haberler' plus lowercase slug,
   or '/telefonlar' plus lowercase slug. Duplicate routes use
   ordered-unique canonical SHA construction. Deny encoded paths,
   query strings, traversal, uppercase or non-string JSON.
4. Match the independent one-time, <=15-minute authorizer grant
   to the DB-computed SHA, operator, issuer identity and ticket.
   Actual external operator signature/IAM not yet integrated.
5. Require trusted schema owner, no PUBLIC or named-role CREATE,
   and safe SECURITY DEFINER search_path; on drift ABORT.
6. One narrowly authorized broker consumes a grant, records audit,
   resets only original completed NULL-SHA receipt and sends
   original Queue message. On failed send, roll back entire TX.
7. On a Queue send with ambiguous database COMMIT, withhold DLQ ACK;
   reconcile original outbox, DB grant consumption, durable audit,
   receipt status and actual cache purge in a separate decision.
8. Parallel DLQ replays may send duplicates; never claim global
   exactly-once. Active lease remains processing and retried.
9. Image rights withdrawn AFTER final query before last bytes
   remain an unresolved distributed race. No real media, R2
   buckets, Cloudflare zone or licensed publisher are permitted.

Do not merge main or deploy, connect DNS, Neon, Queue or CDN.
