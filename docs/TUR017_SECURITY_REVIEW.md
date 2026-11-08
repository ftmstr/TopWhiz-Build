# TOPWHIZ TUR017 — Security boundary / threat model
Date: 2026-11-09. Real isolated PostgreSQL 16 + local workerd and
Chromium + original synthetic PNG; NO live service identities.

## What changed
TUR015/016 proved that a recovery grant was created by a distinct
authenticated authorizer and passed an event/digest/operator/ticket
tuple, but the stored digest was asserted by that operator rather than
cryptographically recalculated in the database. This trust was weaker
than the original immutable outbox. Migration 0016 computes the SHA
using the actual outbox row. New grant INSERT and existing grant
consumption must match the original digest; otherwise an error aborts
the entire receipt reset, audit and grant consumption transaction.

The trusted DEFNER schema may become PUBLIC or named-role writable
after it was checked by the initial migration. New digest calculations
also reject schema ACL drift, leaving an already-approved grant unused.
Do not grant CREATE to unrelated role memberships; revoke only under
separately authorized migration administration.

## Residual limitations / no production claims
- Migration owner or SUPERUSER can replace triggers, functions and
  table rows. No protection against schema owner itself is asserted.
- A compromised grant issuer can still approve a VALID original event;
  a SHA-256 is not a human/operator signature. Real external IAM,
  dual-party approval, trusted issuer keys and audit custody are pending.
- SQL-to-JS digest equivalence is tested with fictional ASCII
  routes, UUIDs and duplicated routes. The accepted route contract
  remains restricted; no arbitrarily encoded URL/payload claim.
- Queue sends/commits remain at-least-once. Multiple parallel DLQ
  operators may resend; a durable exact-digest claim bounds the purge.
  Lost COMMIT responses and leases are inherited from TUR015 tests.
- R2 mid-stream revocation denial is bounded by final lookup. Rights
  withdrawn AFTER that lookup but before network bytes complete can
  still race. Per-response distributed atomic authorization is absent.
- Worker no-store and validators cannot remove pre-existing CDN
  objects globally; actual Cloudflare zone purge has NOT_RUN.
- Automated axe and synthetic timing are neither independent WCAG
  review nor real user Core Web Vitals.
- LGPL-3.0-or-later native libvips and AGPL-3.0 compliance, publisher
  and image rights, TOPWHIZ/TOPWIZ mark and unprotected main block release.

## Real release gates
Independent two-person authority, signed ticket verification,
owner/migrator separate from runtime credentials, DBA ACL audit,
canonical Queue event and audit reconciler, R2/source licenses, actual
zone-cache purge, reproducible licensing notice/source obligations,
manual keyboard/screenreader tests and branch protection review.
No production migrations or deploy in this tur.
