# TOPWHIZ TUR013 — Security review: publication fencing and at-least-once ACK
Date: 2026-11-08. Isolated CI evidence only.

## Attack, invariant, residual risk

| Threat | Enforced control | Still NOT proven |
| --- | --- | --- |
| Old approved public version survives withdrawal | Security-barrier view requires valid license, issuer and published fence whose generation equals latest committed outbox revision | Real CDN cache may serve a preexisting HIT without running Worker |
| Malicious/stale fence row claims earlier revision | DB CHECK generation>=version, active version equality, latest outbox revision equality and published state; missing/mismatch denies | Schema owner remains fully trusted |
| Source/media/issuer revoked during rollback | TUR012 resource-before-submission locking, transactionally updated fence, revision and outbox, verified historical rights and Ed25519 signature | Direct table mutations outside the audited revoker can omit cache event |
| Queue event UUID reused with changed routes | Consumer validates every canonical field against original durable outbox then SHA-256 binds body and UUID | Digest is an integrity binding, NOT an issuer signature |
| Purge callback succeeds but receipt DB commit fails | Retry without ACK, release lease, possible safe duplicate purge | Real Cloudflare Queue or global zone cache not exercised |
| Fake DLQ manual ticket grants purge | Must also match original outbox before separately authorized operator audit/send | Real Access/identity provider, DLQ alerting and rate limits |
| R2 right revoked while object is streaming | Check approval before byte retrieval, fully validate size/MIME/PNG structure/SHA-256, recheck approval before response | Revocation after final check can still occur; strict per-request cross-region barrier NOT implemented |
| Licenced HTML cached at Worker pre-handler layer | Explicit cache.enabled=false and dynamic no-store/CDN headers in actual local vinext workerd and read API | Previously cached live zone objects not purged; real global deployment NOT_RUN |
| Software license falsely declared clean | Exact frozen Next 16.4.5 → optional Sharp 0.35.5 → optional libvips 1.3.4, automated inventory and review blocker | Qualified LGPL/AGPL and third-party data/image legal review OPEN |
| Automated CI confused with field evidence | 50 unit, 13 PG, 36 browser, 40 local workerd probes; axe/SEO/perf bounded | No real capacity, Core Web Vitals or WCAG certification |

## Stronger invariants
- Any missing, forged or outdated fence state hides content even when
  published_content_versions still includes its immutable payload.
- The fence update, state change and durable event are within ONE
  PostgreSQL transaction on the affected submission. Deny if
  the active public version or license/issuer evidence is inconsistent.
- Outbox delivered means delivery to Queue, NOT CDN purge. Receipt
  completion is recorded after successful purger callback and
  before ACK; at-least-once delivery can legitimately repeat purge.
- All accepted Queue fields match a durable publisher/withdrawal
  event in PostgreSQL. Do not accept user-asserted approval/ticket.
- Legacy pre-TUR013 receipts with NULL event hash have no
  retroactively provable payload digest. Drain/inspect/retire them
  under independent operator review before any production cutover.
- Cloudflare caching can bypass Worker execution on HIT. Dynamic
  rights-sensitive data MUST use no-store; no-cache alone may store
  and revalidate. Static robots.txt is a separate public asset.
  Docs: https://developers.cloudflare.com/workers/cache/configuration/

## Unresolved security gaps and release blockers
- No actual Cloudflare zone purge/cross-region cache proof or
  live Preview/Access; no real R2/Queue/DLQ; no live issuer vault.
- Existing DB role can change some rights/evidence directly;
  authenticated operational SQL and DB-trigger audit enforcement
  must be reviewed to prohibit bypassing outbox.
- Media double-check cannot guarantee a rights change will not
  occur immediately after verification before network send.
- Browser axe serious/critical zero is NOT a WCAG certification;
  real screen-reader, pen test and user traffic are not tested.
- Main is still unprotected; TOPWHIZ/TOPWIZ trademark, AGPL-3.0
  and LGPL-3.0-or-later transitive libvips remain OPEN.
- Never activate real tech stories, prices, licensed photography
  or Google AdSense. Do not merge/deploy.
