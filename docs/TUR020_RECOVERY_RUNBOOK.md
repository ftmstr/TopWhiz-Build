# TOPWHIZ TUR020 — Queue/DLQ, media-generation and restart checks
Date 2026-11-09. Synthetic CI ONLY; NOT an operator production runbook.

1. Verify authoritative original transaction outbox, signed-like
   immutable event identity, canonical event SHA and exact
   allowlisted routes. Do not trust DLQ payload or old NULL-SHA
   completed receipt as successful Cloudflare purge evidence.
2. Check schema owner, migrator identity, named-role and PUBLIC
   CREATE ACL, SECURITY DEFINER search_path with pg_temp last.
   Any change fails closed. No broker or issuer owns schema.
3. Resolve independent issuer/ticket and one-use grant; apply
   unique broker claim and immutable audit. Concurrent Queue or
   DLQ replay may duplicate sends; only durable completed
   exact-hash purge receipts bound later ACK decisions.
4. Queue send accepted but SQL COMMIT response lost: withhold
   DLQ ACK, inspect durable original outbox, consumed grant,
   receipt, audit and external Queue actual state. An active
   processing lease is RETRY, never old completed proof.
5. For test-only generated media, admissions are generation
   bound and block once revoke begins; a revoke callback may
   run only after test-local permits are explicitly closed.
   Failure/lost ACK/restart during callback => quarantine
   with independent reconciliation; do not time out a pending
   permit and call the remote last byte delivered.
6. A separate mock ledger reproduces cross-isolate bypass:
   real coordinator identity, durable monotonic version and
   authoritative external operator mutation control MUST be
   reviewed before any production implementation.
7. Local JS EOF or invented delivery acknowledgements are NOT
   network last-byte proof. Existing global edge caches remain
   a separate release blocker requiring genuine authorized
   invalidation receipts. Issue #22 remains OPEN.
8. Do not merge main, publish real rights media, use live
   Cloudflare/Neon/Queue/CDN or release pricing and ads.
   AGPL/LGPL, trademark and source rights are also HOLD.

Any uncertainty => QUARANTINE / NO-GO, never automated publish.
