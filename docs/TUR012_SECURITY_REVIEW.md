# TOPWHIZ TUR012 — Security and transactional consistency review
Date 2026-11-08. All changes are isolated synthetic engineering work.

## Security model and explicit limitations

| Risk | Control/test | Unresolved |
| --- | --- | --- |
| Blindly restoring a superseded article after rights revocation | Previous PUBLIC version must exist; source/media rights are actively rechecked with PostgreSQL FOR SHARE and no withdrawn reactivation; fail-closed view | Real external rights registry not integrated |
| Historical content silently exposing expired/stolen signer approval | Review grant must still be approved and recent (30 days); issuer must be active with same public key and original verified signature; signature re-verification | Actual signing key vault, periodic independent third-party revocation notices |
| Concurrent source/issuer revocation and publication rollback skip cache purge | Consistent resource/issuer before submission lock ordering; source revoked before scanning active HEAD; revokers read the selected HEAD, not latest historical version; durable event and audit in one transaction | External DB direct writes that bypass revoker/outbox not supported; actual CDN zone purge not tested |
| Duplicate/late/out-of-order cache invalidation | Strict route allowlist, source version and event UUID, durable PostgreSQL receipt, synthetic zone API only; older purge only invalidates routes, cannot authorize publication | Real global Cloudflare CDN invalidation, race with edge HTML caching, queue observability remains NOT_RUN |
| DLQ poison replay | External operator ticket callback, audit-before-Queue, completed durable receipts, 60-message redrive fault test; event schema strips unknown fields | Real Cloudflare Queue/DLQ/Access/alerting not configured |
| R2 tamper under contention | 64 accepted/64 altered original PNG streams with SHA-256 and PNG CRC; strict length, no-store, rights revocation fail closed | No real R2 bucket, full image codec/AV, EXIF/ICC sanitization |
| Accidental publication via Preview | Real local workerd RSC/SSR + no secrets/remoteBindings; robots/noindex and inactive Ads verified | No protected live preview or zero-trust Access acceptance |
| Supply-chain vulnerabilities | Frozen pnpm install; fail on high/critical production audit vulnerabilities; license inventory and Next/Sharp provenance | LGPL-3.0-or-later legal review is OPEN; no production artifact rights proof |
| Accessibility/performance overclaim | Chromium responsive layouts, axe severe issues, keyboard focus, local bounded p95 | Not WCAG certification or production Core Web Vitals/load validation |

## Lock order and publication invariants

1. Historical rights/issuer rows acquired with FOR SHARE before
   content_submissions FOR UPDATE. Rights revocation locks and flips
   authoritative rights row before selecting current head and withdrawing.
   Issuer revocation locks the issuer row before selecting current head.
2. Revision/version conflict rejects stale operator actions; target is
   already published and target<current public version. Original public
   payload is never overwritten or synthesized by AI.
3. cms_public_pages checks source and media rights AND the historical
   exact issuer signature for active head on every database read.
4. A successful rollback writes a NEW optimistic revision and durable
   outbox event without granting an unverified new editorial version.
   A separate active pointer chooses a prior independently verified
   edition; review/issuer recency is revalidated. A subsequent normal
   publication advances the head again.
5. Real global CDN freshness is NOT proven by a local fake purge:
   until a purge truly succeeds, a previously cached page outside the
   DB may remain. An Access-protected staging deployment must fail
   closed on the edge or bypass caching for rights-sensitive pages.
6. Any direct external mutation of license/evidence tables without
   authenticated revoker/reconciler/outbox must be prevented by actual
   production role assignment and audited transactional entrypoints.

## Mandatory legal and operational gates
TOPWHIZ/TOPWIZ trademark; AGPL-3.0; LGPL-3.0-or-later libvips
notice/source/relinking obligations; source-photo data licenses;
reviewer identity and key custody; manual screen-reader QA and
private staging cache/Queue tests: ALL NOT APPROVED.
No real Cloudflare account, domain, price, technology image, news
feed, ad script or main merge.
