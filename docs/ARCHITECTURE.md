# TOPWHIZ — Technical Architecture (Proposed, not implemented)

Status: DESIGN / NOT IMPLEMENTED  
Last reviewed: 2026-11-07  
Decision gate: Brand clearance must be explicitly resolved before public product launch; architecture and documentation may be reviewed independently.

## Product principle

One canonical, provenance-aware product catalog powers the website, mobile app, comparisons, benchmarks, price insights, editorial content and optional AI purchasing assistant. Never fabricate a specification, benchmark, price, source or product image.

## Proposed stack (uninstalled)

| Area | Proposed choice | Reason |
| --- | --- | --- |
| Language | TypeScript | Shared type contracts |
| Web | Next.js + React | Indexable specifications and comparison pages |
| Mobile | React Native + Expo | Shared API access |
| API | Fastify | Schema validation and explicit versioned endpoints |
| Database | PostgreSQL + Drizzle ORM | Relational integrity and migrations |
| Research/ingestion | Python jobs | Source extraction, normalization and validation |
| Workspace | pnpm monorepo | Reusable packages and deterministic builds |
| Test | Vitest + Playwright | Unit and end-to-end coverage |
| CI | GitHub Actions | Reproducible quality gates |

No framework versions are pinned or claimed verified at this stage. Evaluate license compatibility and maintenance status before installation.

## Proposed repository structure

```text
apps/
  web/               # public website
  mobile/            # Expo app
  api/               # REST API
packages/
  db/                # schema + migrations
  contracts/         # shared API and domain types
  ui/                # reusable visual primitives
  config/            # lint/tsconfig build standards
services/
  ingestion/         # staged source import/validation jobs
docs/
  ARCHITECTURE.md
  DATA_POLICY.md
  ROADMAP.md
  TRADEMARK_CLEARANCE.md
```

Directories above are a *target design*, not a claim of existing code.

## Catalog: suggested normalized entities

- **Brand**: stable ID, canonical name, verified aliases.
- **DeviceFamily**: series-level identity; never conflated with a purchasable variant.
- **DeviceModel**: model identity, manufacturer SKU/model number, region, announcement and release status.
- **DeviceVariant**: RAM/storage/SoC/connectivity/market and other variant-specific differences.
- **SpecificationDefinition**: key, unit, data type, version, display category, normalization rules.
- **SpecificationValue**: device/variant, typed value, provenance record ID, confidence and moderation state.
- **SourceRecord**: URL, publisher, retrieval time, terms/license permissions, retrieved content hash, claim extraction metadata.
- **BenchmarkResult**: benchmark family/version, device variant, test conditions, score, source, date. Scores across incompatible versions must never be merged.
- **PriceObservation**: merchant, currency, country, amount, availability, observed timestamp, affiliate disclosure. Prices are time-stamped observations, not guarantees.
- **MediaAsset**: copyright owner, origin, license/permission, allowed use and attribution; default deny public redistribution when rights are unknown.
- **EditorialArticle**: original writing, author/editor, references, revision log.
- **ChangeAudit**: changed field, previous/new values, actor/process, evidence, time, reason.

## Data boundaries

1. All ingestion enters a staging area. Untrusted extraction is never directly published.
2. Validate identity, normalized units and duplicates. Human review is required for ambiguous model mapping or conflicting high-impact facts.
3. Store evidence for every published claim. An AI-generated inference is not a verified device specification.
4. Keep fields for `unknown`, `not applicable` and `not yet announced` distinct.
5. Label provisional specs, prototypes, rumors and launch announcements explicitly.
6. Preserve a full revision history and reversible corrections.
7. Search/indexing must only include reviewed/public records.
8. Audit outbound links, merchant terms, image rights and applicable rate limits.

## API sketch (not implemented)

- `GET /v1/brands`
- `GET /v1/devices?brand=&query=&page=`
- `GET /v1/devices/:id`
- `GET /v1/devices/:id/variants`
- `POST /v1/compare` (bounded item IDs; stable comparison schema)
- `GET /v1/benchmarks?deviceId=&version=`
- `GET /v1/prices?variantId=&country=&currency=`
- `GET /v1/articles`

Contracts must include validation, pagination, rate limits, error shapes, API versioning, caching and authentication for privileged mutations. Public GET routes must not expose staging data or supplier secrets.

## Minimum security, reliability and transparency gates

- No secrets committed to Git; least privilege for CI and ingestion keys.
- Lock dependency versions, run vulnerability and license checks, generate a dependency inventory.
- Cross-device comparison uses the same unit semantics; unavailable fields are shown as missing, not zero.
- All published claims trace to allowed sources and snapshots; suspect records are quarantined.
- No scraping of restricted or licensed catalogs without valid permission.
- Test database constraints, transformations, deduplication, stable device IDs and correction workflows.
- Add accessibility, performance budgets, SEO and Turkish/English localization during subsequent product work.
- Track operational costs and free-tier quotas; a no-additional-spend goal does not imply free unlimited hosting.

## First vertical slice (only after engineering green light)

Import a small, permission-cleared fixture catalog; validate and display a device listing, detail page and side-by-side comparison. Use synthetic/sample entries where rights are not established. Quality passes before broader ingestion or AI advice.
