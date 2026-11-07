# TOPWHIZ TUR006 — Transactional CMS / Cloudflare readiness report

Date: 2026-11-07
Branch: feat/tur006-cms-transactions-workers-20261107
Draft PR: https://github.com/ftmstr/TopWhiz-Build/pull/9
Parent Draft PR: https://github.com/ftmstr/TopWhiz-Build/pull/8
Status: DEVELOPMENT ONLY; main unchanged; NO DEPLOY / NO REAL ADVERTISING OR CONTENT.

## Baseline verified before development

- TUR005 Draft PR #8 was open, not merged; head `3016877e3acd7a10af60fee82fd8d583769d967b`.
- TUR005 report `docs/TUR005_REPORT.md` and Ads architecture `docs/TUR005_AUTOMATION_ADS.md` re-read.
- TUR005 CI https://github.com/ftmstr/TopWhiz-Build/actions/runs/42407530766 completed **success**. Price API/web regression checks also success.

## Changes delivered in the Draft PR

1. **Real PostgreSQL transactions** in `services/prices-worker/src/cms/repository.ts`:
   - `submit` idempotent external key and immutable type/slug; pending-review storage.
   - `revise` requires expected revision, never rewrites an already-approved public version.
   - `publish` uses a transaction with `SELECT FOR UPDATE`, reads source licenses, trusted media approvals and per-revision reviewer grant **from protected database tables**; denies missing evidence, invalid variants, unreferenced spec fields or stale reviews.
   - On approval: create immutable `published_content_versions`, update route bindings, record rights audit, add durable cache event to outbox, then commit atomically.
   - On verification failure: quarantine without exposing draft. Previously approved public version remains intact.
   - `withdraw`: atomically retract route bindings, mark withdrawn and queue outbox event; history remains for audit, but public reader filters withdrawn state.
   - Concurrent race and duplicates protected by unique keys, row locks, revision checks and idempotency gates.
2. **PostgreSQL migration 0004**: trusted sources with approved source URLs/labels; media assets with digest, license evidence and approval; independently reviewed author attribution; per-revision review grants; durable `cms_delivery_outbox`.
3. **R2 staged media**: accept only independently licensed PNG/JPEG/WebP bytes with signature check, size cap, SHA-256 and controlled immutable key; no public URL issued before review. No bucket bound or object uploaded in production.
4. **Cloudflare Queues & caching**: transaction outbox relay using official Queue HTTP API and injected secrets, at-least-once idempotent purge consumer using per-message ack/retry, globally scoped Cloudflare zone cache purge (not local-only cache.delete). No actual queue, zone or credentials configured.
5. **Read-only public CMS**: `GET /v1/content?type=news|phone` and `GET /v1/content/news/<slug>` or `/v1/content/phone/<slug>`; only immutable approved versions, published state, no raw draft/reviewer records. Note the returned device type is **phone** (singular), while site page is **/telefonlar/**.
6. **Next.js server integration**: /haberler, /telefonlar and corresponding detail routes plus homepage news section can read approved CMS API at request time with `TOPWHIZ_CMS_API_BASE` and exact `TOPWHIZ_CMS_API_HOST`. Fail closed when API is absent/unavailable and retain empty development registry. New GitHub commits are not necessary for each approved content update after the API is configured.
7. **One protected intake contract**: `handlePrivateCmsIntake` accepts one JSON record on POST /internal/cms/submit with HTTPS + constant-time Bearer verification, bounded request body, draft-only submission and no way to self-approve. This is a **module**, not a public mounted endpoint or running server.
8. **Preserved Ads layout**: top, right (desktop only) and bottom remain non-clickable labeled placeholders, no AdSense scripts or publisher account.

## Test architecture

- Node security tests: unauthorized intake, forged approval, malformed URLs/cache routes, Queue acceptance/retry, R2 denied licensing, nonce/digest behavior, content and source rules.
- Actual ephemeral PostgreSQL 16: 0003/0004 schema transactions, permission-denied draft publication, independent-source + reviewer approval, immutable revisions, conflict/duplicate prevention, published phone source references, withdrawal and outbox idempotence.
- Frozen pnpm install, TypeScript, Next.js production build, Wrangler `--dry-run` for read-only price/CMS Worker and separate cache-purge Worker, vinext compatibility scan.
- **Do not claim PASS for the newest head until current GitHub workflow is checked.** CI prior to final report: https://github.com/ftmstr/TopWhiz-Build/actions/runs/42412086070 succeeded at an earlier feature head with 36/36 Node and 2/2 PostgreSQL tests; final head must be read separately.

## Known limitations & release blockers

- No real external retailer feed, real article, trademark clearance, rights-cleared product photo, stored production object, author verification, approved AdSense account, API/database credentials or production site.
- No production identity provider, user-role separation or live reviewer service. Database grant permissions and independent verification actor are mandatory before enabling any auto-approval. **AI self-reported permissions are not proof.**
- No actual R2 media GET/Next image delivery, content moderation workflow, accessibility/browser acceptance or live URL-level CDN cache verification; those are additional release gates.
- Queue consumer is a dry-run module without configured queue trigger or DLQ; relay is not scheduled. Before launch configure a dead-letter queue, at-least-once replay, privilege-scoped tokens, monitoring and retry/revocation runbook.
- Current vinext check is a static compatibility scan, not Cloudflare website deployment or full runtime acceptance.
- Schema migration is tested on isolated CI database only; no production migration applied. Published-content table has **no real data**.
- TOPWHIZ/TOPWIZ trademark, AGPL-3.0 commercial compliance and branching/release policies remain unresolved.
- No main merge, domain purchase, live Cloudflare deployment, real Google AdSense loading, or unverified output publication.

## Official integration references

- Queues HTTP push: https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/push/
- Queues ack/retry: https://developers.cloudflare.com/queues/configuration/batching-retries/
- R2 Worker bindings: https://developers.cloudflare.com/r2/get-started/workers-api/
- Global zone purge: https://developers.cloudflare.com/api/resources/cache/methods/purge/
