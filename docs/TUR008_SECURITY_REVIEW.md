# TOPWHIZ TUR008 — Security assessment

Date: 2026-11-08. DRAFT ONLY. Nothing provisioned in a real Cloudflare/Neon account.

## Threat and control table

| Risk | Implemented control | Remaining gate |
| --- | --- | --- |
| AI fabricates editorial approval | Ed25519 verification of issuer, exact revision, evidence, author and timestamp using independently stored public key | Real signing key custody, issuer onboarding, access authorization |
| Intake accesses drafts/reviewer state | Seven isolated PostgreSQL NOLOGIN roles; SECURITY DEFINER draft writer with fixed search path, limited EXECUTE | Real credential allocation and per-tenant access |
| Public API leaks private content | Security-barrier page/media views; reader role gets SELECT only on views | Real read-only Neon account |
| Draft revision bypasses revoked rights | Immutable public-version dependencies tied to source/media IDs, live rights check in view | Production rights feed and revocation alerting |
| Licenses withdrawn after publication | Atomically revoke source/media, withdraw affected public pages, remove route bindings, audit actor and enqueue outbox | Authenticated rights authority, monitoring, appeal/rollback |
| Queue duplicates/poison messages | Durable receipt lease with claim token, completion after purge, bounded retry and nondeploy DLQ sample | Actual Queue/DLQ provisioning, alerting, replay runbook |
| Forged R2 metadata | Bounded bytes, magic signature, MIME, length and actual SHA-256 recomputation | Malware/decoder checks and real object tests |
| Preview exposed/indexed | No-deploy static preflight; separate Access-protected preview proposal | Upgrade pinned Wrangler from 4.131 to >=4.135; configure Access |

## Required role separation

- tw_cms_intake: execute only the guarded draft submission function.
- tw_cms_attestor: separately permitted attestation insertion; private key never in DB.
- tw_cms_reviewer: read independent evidence and insert version-scoped approval.
- tw_cms_publisher: publish immutable versions, route binding and outbox.
- tw_cms_rights_admin: license revocation and withdrawal, not approval issuance.
- tw_cms_queue_consumer: durable receipt only, not content or license tables.
- tw_cms_reader: public approved views only, no underlying drafts/reviewer data.

Operator-only role bootstrap: services/prices-worker/security/cms_roles.sql.
Replace the single schema placeholder with an allowlisted schema name as trusted DBA.
Do not grant roles to a shared service login. No production roles were created.

## Important open risks

Attestation authority deactivation/revocation after publication is NOT automatically
propagated; TUR008 automatically withdraws on SOURCE/MEDIA rights only. A dedicated
authority-revocation reconciler is needed. Signatures prove a verifier signed
an assertion; they do NOT prove a license exists or a source is accurate.

Queue DLQ is a static non-deploy configuration example. Poison-message recovery
and telemetry are NOT CONFIGURED. R2 12-byte PNG CI fixture is NOT a displayable
real image or image decoder acceptance. Browser and genuine Cloudflare runtime
preview tests are NOT_RUN.

Brand TOPWHIZ/TOPWIZ, AGPL, image/source licenses, Google AdSense approval and
consent/privacy are open. The upper/right/bottom ad slots remain inactive.
No merge, domain purchase, deployment, real data import or ads activation.
