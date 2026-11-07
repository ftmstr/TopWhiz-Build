# TOPWHIZ TUR006 — Content contract and privileged publication runbook

**Preview code only.** No production keys, feed credentials, merchant prices, news or media in repo.

## Standard content workflow

1. The AI/authorized agent sends one record to the private intake module:
   POST /internal/cms/submit, JSON object with exactly two keys:
   `externalKey` (stable idempotency key) and `content`.
   The private handler enforces HTTPS, bearer secret, JSON, 64 KiB body and draft-only response. This route is NOT mounted on any public Cloudflare Worker.
2. The content goes to `content_submissions` with `pending_review`, never direct publication.
3. Independent reviewer/approved verification service populates source evidence, media rights evidence and version-specific review grant using a separately privileged database role. Authors and tech-spec sources are corroborated; AI-submitted rights flags are ignored.
4. Trusted publisher calls `CmsRepository.publish(id, expectedRevision)`, which locks the content row and checks current source, media, originality, editorial and variant/spec rights. Quarantine is default on failed proof.
5. On success: immutable version + audit + routes + outbox commit as one PostgreSQL transaction; no GitHub edit necessary for each news item.
6. An internal outbox dispatcher sends approved invalidation events via Cloudflare Queues API, marks sent **only after Queue acceptance**; Queue consumer purges exact URLs globally and explicitly acks/retries. Cache invalidation is asynchronous; eventual consistency and failure monitoring required.
7. Next.js renders read-only approved content via the CMS GET API when explicitly configured.

## Structure and placement

| Type | Required fields | Automatic routes |
| --- | --- | --- |
| news | slug, title, original body, summary, source IDs, language/time, independently reviewed author, optional licensed media ID | /haberler/{slug}, /haberler, / |
| phone | brand, model, market, SKU/warranty/variants, individually sourced technical specs, optional licensed media ID | /telefonlar/{slug}, /telefonlar, /karsilastir |
| price | Independently authorized merchant offer + verified timestamp/currency/stock/warranty | Separate /v1/prices API only; NOT updated by news agent |
| media | Rights evidence, SHA-256, allowed MIME, alt, immutable R2 key | Private R2 staging; public delivery not enabled |

**Key separation:** media IDs refer to separately approved asset entries. Do not accept arbitrary AI-supplied URL or R2 key. Image object remains private until actual delivery gate implemented.

## Review and source protection

- `cms_trusted_sources`: independently approved source ID/type/HTTPS citation/rights.
- `cms_media_assets`: independently verified image rights, mime, checksum and controlled key.
- `cms_review_grants`: submission+revision scoped reviewer grant, editorial/originality/spec checks, reviewed author and date; insertion privileges MUST be separate from intake.
- `content_rights_audit`: immutable publishing evidence timeline. `published_content_versions`: immutable safe public snapshots.
- `cms_delivery_outbox`: persistent cache events, possibly retried/duplicated; consumer processing must be idempotent.

Never label a queue event as a finished purge until Cloudflare API confirms acceptance. Add a DLQ and monitoring for max-retry failures before deployment.

## Environment variables — no values committed

- `TOPWHIZ_CMS_API_BASE`: externally approved HTTPS origin for read-only API.
- `TOPWHIZ_CMS_API_HOST`: exact hostname allowlist, must equal CMS API base URL hostname.
- `DATABASE_URL`: secret in Cloudflare environment for read-only Worker (future).
- `TEST_DATABASE_URL`: synthetic ephemeral PostgreSQL in GitHub Actions only.
- `CF_ZONE_ID`, `CF_PURGE_TOKEN`, `SITE_ORIGIN`: queue consumer secrets; not set in repo.
- Queue sender: account/queue IDs and dedicated **Queues Write** API token from secret manager.
- R2 media bucket is a future private binding; no bucket name, route or credentials configured.

## CI commands (development only)

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm --filter @topwhiz/prices-worker test:pg
pnpm --filter @topwhiz/prices-worker test:cms
pnpm typecheck
pnpm build
pnpm worker:check
pnpm cms:dry-run
pnpm --filter @topwhiz/web compat:check
```

## Do-not-publish rules

- No live Google Ads: only top/desktop-right/bottom labeled placeholders.
- No direct AI HTML, unlicensed content, invented device specs or product prices.
- No Cloudflare deploy, DNS/domain registration, production DB migration or main merge.
- Complete trademark/IP/licensing, privilege isolation, media public-serving security, approvals, privacy/consent, responsive/browser QA, threat model and production recovery test before launch.
