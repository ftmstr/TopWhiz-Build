# TOPWHIZ TUR009 — Security architecture and operator review

Date: 2026-11-08. No production identities or external services are provisioned.

## Threats and defenses

| Threat | Defense in code | Verified / open |
|---|---|---|
| Independent reviewer signs and later loses authorization | Immutable edition-to-reviewer/public-key relationships; every public read checks issuer active, key unchanged and evidence still verified | Synthetic PostgreSQL test for active=false, rotated public key and status=revoked; no real key-vault |
| Auto-approved content is published after reviewer revocation | CmsRepository.publish checks each Ed25519 signature, issuer status, timestamp and exact revision inside atomic transaction | Regression test for signed publication; real asynchronous race/monitoring still needed |
| Revoked issuer content still visible via newer private draft | Publication-specific issuer+source+media references, NOT draft-state references | Public view fail-closed; reconciliation creates actual withdrawal and outbox |
| Public read can inspect raw draft/reviewer records | Eight service groups; genuine distinct LOGIN sessions via PostgreSQL 16 CI; reader SELECT on security-barrier view only | Deny SQL against raw content; production account membership NOT_CONFIGURED |
| DLQ operator could replay forged poison/duplicate message | Ticket callback, strict event URL/path contract, durable receipt-state gate, audit-first send and no-ack on failed Queue send | CI PostgreSQL receipt + rejected ticket/poison/repeated-complete; live DLQ not bound |
| R2 object metadata lies about stored bytes | Bounded stream reads, real SHA-256, RGB/RGBA 8-bit PNG chunk CRC/IDAT geometry, JPEG EOI and WebP length checks | Original generated PNG 256x192 and tamper/truncation tests; AV, full decoder and real R2 NOT_RUN |
| Dependency update skips frozen verification | Wrangler 4.135.0 pinned and matching pnpm-lock.yaml; branch-scoped one-time lock-updater deleted | CI frozen install and both Wrangler dry-runs |
| Preview is indexable or exposes secrets | No real preview, no credentials in git, staged local vinext probe only | Access and noindex policies must be verified in eventual authorized Cloudflare test account |

## Design notes

The storage tables cms_public_issuer_dependencies and
cms_public_dependencies point to immutable published version IDs. Public views
deny a page if its source/media license, issuer state, public-key fingerprint
(via exact PEM snapshot), or signed evidence has changed. This denial applies
at query time; it is NOT a guarantee that stale worldwide CDN caches
have already expired. A transactionally recorded outbox event is necessary
and must be replayed with Cloudflare cache purge during deployment.

For signing-key rotation, a newly registered public key never silently
reinterprets old signatures. The reconciler withdraws affected content; any
republication requires an independently signed/new revision.

An operator must verify rights-revocation/issuer-revocation reason, actor and
scope independently; these functions are NOT exposed as public HTTP endpoints.
The DLQ operator callback must check real external identity and approved
ticket. A forged "approved" property in a Queue message is ignored.

The CI-created eight LOGIN roles are genuinely separate sessions, but all
exist solely in a disposable PostgreSQL test database. Production still needs
separate secrets, rotation, auditing, membership and permission review.

## Open release blockers

- No Cloudflare Queue/DLQ, external signing service, real public site,
  actual R2 storage or Neon production read-only identity.
- No full image decoder, AV scan, EXIF/privacy scrub, color-profile or media
  pixel dimensions assertion beyond bounded PNG header + CRC.
- No per-tenant rate/abuse limits, revocation webhook authentication,
  human operational alerting, real DLQ poison holding area/monitoring.
- Vinext Web/Workers app runtime may require React 19.3.1 and @vitejs/plugin-rsc
  versioned migration; synthetic CI experiments do not count as deployed support.
- No Google AdSense publisher ID, scripts or active ad slots; top/right/bottom
  placeholders preserved. No real articles, phones, prices, images or accounts.
- TOPWHIZ-TOPWIZ mark, AGPL and third-party data/image license clearance pending.
- No main merge, domain purchase, real Preview or deployment.
