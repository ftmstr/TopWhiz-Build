# TOPWHIZ TUR015 — Security and least-privilege review
Date 2026-11-08. Tests: disposable PostgreSQL 16 + LOCAL Cloudflare workerd ONLY.

## Newly discovered privilege boundary
TUR014 left a broker function callable with arbitrary ticket/operator
parameters. An already privileged broker could bypass a JS operator
callback and change a legacy Queue receipt. TUR015 addresses this
using a separate independent NOLOGIN authorization issuer who can
INSERT a one-time, expiring, exact event-id/digest/operator/ticket
grant. The original broker can only call the constrained function;
it cannot grant itself new authorization. The grant must be unused
and within its 15-minute expiry before the function can consume it,
record audit and reset the old NULL-hash receipt. An unrelated
reader, broker without a grant, forged ticket or forged digest
is rejected. External actual IAM/ticket signature verification
is NOT connected, and the real authorization issuer is a
human/operational trust boundary.

## SECURITY DEFINER search_path and pg_temp
A definer procedure executes with its database owner's privileges.
A temporary table created by an unprivileged caller could shadow
unqualified tables if pg_temp is searched first. All known CMS
security-definer routines are hardened to pg_catalog, trusted
migrator-owned schema, pg_temp LAST; the existing ingest function
has the same explicit order. The 0014 migration fails for public,
PUBLIC-writable or owner-mismatched schemas. The integration test
creates a fake pg_temp.cms_purge_receipts table from a real restricted
broker LOGIN then invokes the recovery function, verifying that
only the actual CMS schema receipt changes.

Reference: https://www.postgresql.org/docs/current/sql-createfunction.html

## Multi-resource and concurrency invariants
40 independently reviewed fake publications, overlapping two
licensed sources and an ephemeral signed issuer, are revoked from
three simultaneous authorized operations. Unauthorized direct
source/issuer writes are all rejected at deferred COMMIT. Retry
is bounded to PostgreSQL contention codes; no exception gets
promoted to approval. Durable evidence requires exactly 40
withdrawn publication versions, 40 unique withdrawn outbox rows,
40 hidden public pages and 72 concurrent denied reads. A story
with multiple source dependencies may have more than one guard
ledger audit row; each must map to the withdrawal outbox.
One CI run required [1,1,2] authorized operation attempts.
This is a small disposable load test, NOT production capacity.

## Queue ACK, uncertain COMMIT and replay
An origin Queue accepts a canonical event before the legacy
recovery COMMIT. A message consumer may be blocked on a
receipt lock until the transaction commits; it cannot infer
purge from old NULL-hash completed status. On synthetic COMMIT
success + lost response, the caller withholds DLQ ACK, then
reconciles actual durable audit/grant/outbox/receipt and allows
at-least-once re-delivery. An active processing lease cannot
be treated as completed. Only a newly completed exact-SHA-256
receipt after a successful purger callback permits ACK.
No real Cloudflare Queue, DLQ or global zone purge was used.

## R2 and Cloudflare edge limitations
80 approved plus 80 late-revoked R2-like PNG reads and 64
tampered/interrupted payloads validate byte-level denial in
an in-memory test object, not a real bucket. A right revoked
after the final DB re-check but before network response completion
remains a TOCTOU risk; a true per-response distributed lock
does not exist here. 96 local workerd HTTP requests tested
adversarial conditional validators; no-store and no 304 cannot
purge already-cached global edge HTML.

Official Cloudflare docs confirm cache.enabled=false prevents
new lookup/storage but does not automatically purge old entries:
https://developers.cloudflare.com/workers/cache/configuration/

## Critical residual threats / stop gates
- Schema owner, migrator or PostgreSQL SUPERUSER can modify
  triggers, role privileges or SECURITY DEFINER functions.
  Schema-pinning alone is NOT a substitute for real separation
  of owner and application credentials or migration approvals.
- A compromised independent authorization issuer can still
  approve recovery grants. No real external operator identity,
  signing key custody, dual control or production access policy.
- Existing global CDN caches can serve stale licensed pages
  outside Worker invocation until actually purged.
- LGPL-3.0-or-later libvips and AGPL-3.0 obligations remain
  unreviewed by counsel. TOPWHIZ/TOPWIZ mark and all third-party
  media/source/data rights are still open.
- Automated axe/browser and localhost timing are not formal
  accessibility, penetration test or real Core Web Vitals.
- main protection remains disabled. No merge or real deployment.
