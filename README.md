# TOPWHIZ

**TOPWHIZ** is a proposed open-source, AI-assisted technology discovery and product comparison platform. The long-term product includes verifiable device specifications, side-by-side comparisons, benchmark context, time-stamped price observations, original technology journalism, and shared web/mobile experiences.

> **Project status: planning / documentation.** This public repository currently does not contain a working website, mobile app, API, device database or AI service. No automated tests or release claims have been made.

## Planned capabilities

- Searchable device models with clear regional and hardware variants
- Source-backed specifications and corrections history
- Transparent multi-device comparisons and benchmark methodologies
- Price observations that show merchant, region, currency and timestamps
- Original editorial technology news
- Optional evidence-grounded AI purchase guidance
- Web and mobile clients using one API and canonical data source

## Proposed stack (not yet installed)

TypeScript · Next.js / React · React Native / Expo · Fastify · PostgreSQL / Drizzle · Python ingestion · pnpm monorepo · Vitest / Playwright · GitHub Actions

See [Architecture](docs/ARCHITECTURE.md) for the proposed boundaries, schema, and first vertical slice.

## Project documents

- [Architecture and API sketch](docs/ARCHITECTURE.md)
- [Catalog provenance and content-rights policy](docs/DATA_POLICY.md)
- [Delivery stages and verifiable acceptance criteria](docs/ROADMAP.md)
- [Brand / trademark clearance — OPEN, not cleared](docs/TRADEMARK_CLEARANCE.md)

## Branding and IP caution

**TOPWHIZ is a working brand, not a claim of registered or cleared trademark rights.** A separate, existing software business uses **TOPWIZ**. Relevant trademark databases, classes and domains still require completion of a documented clearance review before commercial launch. Creating this GitHub repository does not settle those rights.

Device specifications, external benchmark results, product images, logos, reviews and merchant prices may have separate intellectual-property or contractual restrictions. Publicly accessible is not the same as licensed for copying.

## License

The repository currently contains the **GNU Affero General Public License v3.0** ([LICENSE](LICENSE)). Before integrating libraries, commercial modules or third-party data, review AGPL obligations and compatibility. The code license does **not** grant rights over third-party datasets, product imagery or trademarks.

## Current next step

Review the documentation-only foundation and resolve the Stage 0 licensing and trademark gates. Only then proceed to the reproducible monorepo implementation and a small, provenance-verified device comparison vertical slice.

No production deployment, provider scraping, or automated publication should occur before their respective rights and quality gates.
