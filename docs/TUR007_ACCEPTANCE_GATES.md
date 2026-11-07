# TOPWHIZ TUR007 — Automated CMS acceptance matrix and deployment gates

Status: **CI-verified implementation only**. The work does not give any AI
autonomous access to production publishing credentials.

## Safe one-entry contract

```text
Authorized AI/import source
    -> POST /internal/cms/submit (strict service authentication, draft only)
    -> content_submissions: pending_review / immutable identity
    -> trusted independent evidence authorities:
       * rights-approved sources (URL, label, license evidence)
       * editorial originality/specifications attested per revision
       * authorized image license and private R2 object
    -> cms_review_grants after independent verifier checks
    -> PostgreSQL transaction:
       immutable published_content_versions
       route binding + rights audit + cms_delivery_outbox
    -> public GET CMS API -> news/phone page templates
    -> Queues HTTP acceptance -> CDN purge, replay on failure
    -> withdrawn or revised -> public snapshot and R2 media authority rechecked
```

Nothing in this diagram bypasses the independent grants, nor does the AI
directly edit HTML or choose arbitrary publication URLs.

## Production security obligations

- **Least privilege:** intake DB role INSERT-only on submission; evidence
  reviewer a distinct role; publisher separate; public API SELECT-only on
  published projection. Current CI intentionally uses one privileged synthetic
  role; production grants remain NOT_IMPLEMENTED.
- **Authentication:** private Bearer token in code is a reviewed sample handler.
  For actual deployment use scoped service identity, token rotation, audit,
  per-source quotas, network restrictions, replay control and rate limiting.
- **Rights revocation:** source/media/attestation withdrawal should trigger
  immediate unpublish or manual adjudication with cache/event invalidation.
  The current R2 handler prevents reading media without an actively published
  reference and active media approval. Stale source rights require a separate
  revocation reconciler.
- **Media:** image MIME, length, controlled immutable key, SHA-256 and
  license evidence. R2 bytes are checked against metadata and path, but
  comprehensive antivirus/image decoder and object SHA rehash at serving time
  are NOT implemented. Current browser route has no-store to protect against
  publication revocation races.
- **Queue:** at-least-once delivery requires idempotent consumer; durable
  outbox survives Queue downtime. Real DLQ/retry monitoring and Cloudflare
  permissions are still required. Local Cache API deletion is not global
  invalidation.
- **SEO/Ads:** truthful source citations, no published fake prices or articles,
  brand/IP clearance, noindex previews, Google AdSense review and consent.
  Keep top/desktop-right/bottom placeholders non-clickable and labelled.
- **Observability:** dashboard for pending/quarantined/revoked/failed outbox,
  reviewer evidence expiry, queue lag and denied media access. Mandatory before
  unattended high-volume imports.

## CI acceptance levels

| Test scope | Current outcome | Boundary |
|---|---|---|
| Node security/ad/media policies | PASS (38/38) | Pure JS / synthetic input |
| Real Postgres price-staging, CMS, auto-publication | PASS (3 integration tests) | Ephemeral PostgreSQL 16 |
| CMS public HTTP contract + R2 + Queue retry | PASS | Database-backed API, simulated cloud bindings |
| Next local synthetic page routes | PASS (5 paths) | CI-only fictional registry |
| Postgres API -> Next SSR -> media | PASS (5 paths + image) | CI-only exact-host fetch shim |
| Frozen install + TypeScript + Next build | PASS | Code verification, not live use |
| Cloudflare Workers dry-run (2 workers) | PASS | Bundle only, NO DEPLOY |
| vinext compatibility | 95%; one partial | Static scan, not runtime |
| Actual internet SSL, DNS, Cloudflare/R2/Neon | NOT_RUN | Needs explicit account setup and authorization |
| Real AdSense, merchant data, editorial source licenses | NOT_CONNECTED | Subject to licensing/legal approval |
| End-user browser accessibility/visual/performance | NOT_RUN | Future release gate |

## CI synthetic data isolation

`tests/fixtures/ssr-seed.ts` creates nonreal records solely in a disposable
PostgreSQL schema. `scripts/tur007-api-preload.mjs` intercepts only the
nonexistent test host `cms.ci.invalid` in GitHub CI with opt-in flag. No real
Cloudflare account, API token or external host is involved. Fixture images are
12-byte signed PNG header-only synthetic data and are **NOT real displayable
product photography**. The separate page smoke test overwrites local fixture
JSON in the runner only and verifies committed content registry is empty.

**DO NOT merge into main or deploy with test hooks enabled.**
