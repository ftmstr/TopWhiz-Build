# TOPWHIZ TUR016 — Threat model / privilege regression
Date: 2026-11-09. Scope: isolated synthetic PostgreSQL; no real IAM.

## New findings and remediation
TUR015 blocked PUBLIC CREATE but its guard did not reject a named role,
including an inherited login/group, with CREATE on the SECURITY DEFINER
schema. A role with CREATE could place dangerous objects on a trusted path.
TUR016 checks every expanded schema ACL CREATE grantee against schema owner
and refuses the migration if any non-owner has this privilege, including
PUBLIC. Grant revocation must precede migration; the tool does not silently
strip grants in an unknown environment.

The independent recovery-authorizer role from TUR015 can INSERT an
authorization row. Previously it could also explicitly populate issued_by,
issued_at or consumed_at; the default session_user field was not a
server-enforced provenance guarantee. TUR016 rejects forgery of issued_by
unless it equals the authenticated session login, rejects historical/future
issued_at, prefilled consumed_at, and invalid expiration. Existing unique
event ID, immutable on-update guard, SQL claim and durable audit remain.

## Nonclaims and residual attack surface
- A compromised REAL issuer login can still authorize an original event.
  Database-issued metadata is not a signature, proof of human identity,
  external ticket validity or two-person approval.
- A malicious owner/superuser/migrator can ALTER/DROP functions/triggers
  and privileges; schema ACL checks do not protect against that actor.
- A matching grant does not independently cryptographically prove the
  content of external operator approval. Real IAM and signed approvals
  require another reviewed design.
- Legacy receipt reset is at-least-once with uncertain COMMIT, not a
  Cloudflare exactly-once guarantee. No actual CDN cache purge performed.
- Worker/cache no-store cannot erase stale global CDN entries.
- R2 authorization re-check is subject to distributed TOCTOU after the
  last check and before the final response byte.
- Inherited frozen pnpm and LGPL-3.0-or-later native libvips blockers,
  AGPL obligations, trademark and photo/source grants remain open.
- Tests exercise one PG16 isolated cluster, not production role membership,
  replication, disaster recovery or an independent security audit.

## Required before any real deployment
Independent operator and grant issuer IAM, no owner/superuser credentials
in app roles, explicit schema ACL review, transaction audit destination,
DB backup/replay, database-specific migration approval, multi-party
authorization proof, zone-wide CDN purge validation and source-rights
clearance. main must be branch protected. Maintain DRAFT/NO-GO until then.
