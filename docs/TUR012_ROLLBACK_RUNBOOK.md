# TOPWHIZ TUR012 — Operator version rollback & fail-closed recovery
Date: 2026-11-08. This is a FUTURE operational runbook, not deployed.

## Prerequisites (all must be satisfied in an authorized environment)
- Authenticated independent publication operator, ticket and a valid
  reason reference. Never call from a public HTTP/AI intake endpoint.
- An existing PUBLISHED submission, with expected current
  optimistic revision, latest active public version and older target.
- Rights active and source/media/issuer evidence still independently
  valid, recent and signed. No rights revoked, missing media or
  unauthorized reviewer. All relevant roles least-privilege.
- Audit/outbox/Queue infrastructure and CDN purge monitoring enabled
  before the operation. No real credentials are in this repository.

## Procedure
1. Retrieve exact active version and optimistic revision from internal
   approved database queries; do not trust browser/mobile client claims.
2. Verify target is an immutable previously PUBLISHED version and
   target version is smaller than the currently active publication.
3. Call internal rollbackPublishedVersion using the trusted operator
   identity/reason and compare-and-swap expected values. It acquires
   current rights/issuer locks, then submission lock, validates
   evidence and performs a single PostgreSQL transaction:
   head->target, revision++, audit row, outbox published invalidation.
4. Do NOT use rollback to reactivate withdrawn/suppressed content.
   A revoked or expired license or reviewer key always means NO-GO;
   request new independently approved content/revision instead.
5. Check resulting cms_public_pages version, noindex and route ACLs.
   Verify queue acceptance, durable purger receipt and zone-global
   invalidation before claiming the CDN no longer serves older HTML.
6. Re-run relevant tests and human approval; report exact evidence.

## Emergency shutdown
- Disable ingress/queue publication first, revoke compromised issuer
  and source/media rights, hide pages in security-barrier reader and
  require independently audited withdrawal outbox.
- Verify cache purge, 404/no-store, R2 byte integrity, and DLQ status
  in an authorized private environment. Do not ACK unpurged events.
- If CDN purge fails, block serving the route or reduce cache policy
  to no-store at edge; do not assume a DB-only denial clears global CDN.
- Preserve immutable history, licenses and reviewer audit, but do not
  export production private signing keys to GitHub.
- Reissue independent review/new revision to re-publish; never
  mark a revoked version active merely to hide a deployment issue.

## Current actual state
No Cloudflare Preview/deploy, Access, real CDN, bucket, Queue, DNS,
real news, phones, images, merchant prices, AdSense or main merge.
Keep Draft PR #15, rollback by reverting TUR012 feature branch only.
