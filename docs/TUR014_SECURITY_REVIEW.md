# TOPWHIZ TUR014 — Security and database-role review
Date 2026-11-08. Tests run on disposable PostgreSQL 16 only.

## Threat model and controls

| Threat | Enforced TUR014 policy | Residual risk |
| --- | --- | --- |
| A privileged rights administrator flips rights_approved=false without outbox | Deferred commit guard snapshots impacted active-public submissions at mutation time; needs withdrawn state, current monotonic fence, routes removed and matching outbox before COMMIT | Schema owner/superuser could disable DDL triggers; operations outside one DB remain unproven |
| Forged source URL/evidence or image SHA after review | Published source/media reviewer fields, URL, licence, R2 key, MIME, byte size and digest are immutable; create a new reviewed ID instead | No real remote source authority or licence registry connected |
| Issuer key/status/attestation changed without withdrawal | Active public dependencies captured; direct issuer invalidation or evidence tamper rolled back without audited same-transaction takedown | Separate external signer vault, attestations and revocation notices not configured |
| Attempted approval reactivation after revocation | Triggers reject false->true source/media or issuer activation; new independent identity/review needed | Schema owner remains trusted |
| Malicious rights row DELETE/TRUNCATE erases history | PostgreSQL reject triggers for all protected source/media/issuer/attestation tables | Superuser/owner bypass or unrelated custom writes outside controlled migrations not proven |
| Queue old completed receipt has NULL hash | Refuse hashed status verification and DLQ 'already completed' ACK, never trust historical status alone | Legacy DLQ inventory, real purge outcomes and cloud queues remain unknown |
| Operator forges legacy receipt recovery | Original immutable outbox queried and canonical SHA computed; independent verifier ticket, audit-before-Queue, constrained SECURITY DEFINER one-time claim; dedicated ninth NOLOGIN broker role | External verified identity callback required, no production Access and operator-secret custody proven |
| Queue sender accepted but DB commit of legacy reset fails | DO NOT ACK; stale legacy row remains/requires manual retry; duplicate Queue delivery safe at-least-once | Could repeat global purge; no exactly-once external side effects |
| Revocation after initial R2 lookup | Original TIFF/JPEG/PNG? Existing MIME and PNG/byte/SHA check, second rights read immediately before response, synthetic revocation 404/503 | Final right change after last check remains a TOCTOU risk; no global CDN proof |
| Browser reuses 304 from stale RSC/SSR | Strip conditional request validators in local Worker, no-store 200/404, disable pre-handler caching, test 60 adversarial requests | Existing external CDN HIT can bypass Worker completely; real zone global purge NOT_RUN |
| LGPL falsely marked approved | No pin/lock change, 216-entry local license inventory keeps review blocker explicit | Counsel review of native binary/AGPL obligations, trademark/photo rights outstanding |

## PostgreSQL role boundaries
- Existing independent roles: intake, reviewer, attestor, publisher,
  rights_admin, issuer_admin, reader, queue_consumer.
- Added tw_cms_legacy_recovery NOLOGIN, with read-only original outbox
  metadata + EXECUTE on narrowly scoped recovery function; it cannot
  directly DELETE a receipt or UPDATE source/media/issuer identities.
- PostgreSQL real LOGIN sessions can connect as these roles for
  positive and negative permission tests. Deployment must never
  hand privileged DB owner passwords to the public API/AI intake.
- CREATE/ALTER/DROP/SET session_replication_role are not granted to
  untrusted roles. A database owner or superuser can bypass triggers:
  this is a hard independent operator trust boundary.
- SECURITY DEFINER search_path captured at migration time. Only
  run migration after validated search_path owned by trusted migrator.
  Never let user-provided schema names influence it.
- Trigger ledger records login_actor, but database-level audit
  retention/backups and external IAM are NOT configured.

## DLQ and stale cache limitations
- Legacy NULL digest cannot be backfilled to claim an old global purge
  succeeded. Authorized recovery resets and RE-PURGES; only a NEW
  verified completed digest receipt can justify ACK.
- Only a real Cloudflare zone purge plus field multi-location
  cache evidence can prove stale HTML is no longer served.
- Worker local 60 conditional GETs show 304 bypass closed in local
  RSC path only. A preexisting zone edge cache may still hit
  outside Worker invocation.
- Queue ACK after receipt completion is an at-least-once promise,
  not exactly-once Cloudflare side effect. Receipt lease and DLQ
  timeouts require actual cloud configuration and alerting.
- Media recheck prevents many in-flight licence reuses but is not
  a lock across the remote public HTTP response.

## Release NO-GO
No real third-party licensing or actual people/brands/photos/prices;
no Cloudflare account/Preview/deploy/Access/Queue/R2/DLQ/global purge;
no production migrations, legal sign-off, DNS, AdSense, main merge.
Manual accessibility, WCAG, production performance and operational
disaster recovery require real acceptance after authorization.
