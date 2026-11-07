# TOPWHIZ — Delivery Roadmap and Acceptance Gates

Date: 2026-11-07  
Status: PLANNING ONLY. No CI or application tests have run.

## Stage 0: Foundation & due diligence (current)

- [x] Confirm public GitHub repository with write access
- [x] Record chosen name and baseline architecture
- [x] Document provenance, rights and publication principles
- [ ] Complete trademark and naming clearance (see TRADEMARK_CLEARANCE.md)
- [ ] Decide whether to retain AGPL-3.0 and document third-party licensing strategy
- [ ] Enable main branch protection, mandatory reviews and required checks (GitHub settings)
- [ ] Approve MVP scope, acceptance criteria and operating budget

Exit: accountable acceptance of trademark risk and licenses; documented repository governance.

## Stage 1: Monorepo foundation

- [ ] pnpm workspace with pinned package manager and Node runtime
- [ ] TypeScript contracts, lint/format/type-check and isolated test workspace
- [ ] API and database migration foundations
- [ ] GitHub Actions on pull requests with least privileges
- [ ] Local .env.example, config validation and contributor onboarding
- [ ] CI passes on clean public runner with evidence

Exit: clean clone can install, validate and test; no fake PASS states.

## Stage 2: Verifiable device catalog (small vertical slice)

- [ ] Permission-cleared seed catalog and regional variant model
- [ ] Normalization, evidence links, reviewer states and audit logging
- [ ] Device list/detail endpoints
- [ ] Web listing and specification detail views
- [ ] Deterministic comparison between two devices
- [ ] Data-integrity tests and accessibility checks

Exit: end-to-end catalog flow reproducible with traceable evidence.

## Stage 3: Extended comparison and content

- [ ] Multi-device comparison and meaningful filter facets
- [ ] Benchmark version controls and measurements methodology
- [ ] Price observations with dates and territory/merchant metadata
- [ ] Original editorial content and rights-safe images
- [ ] SEO, sitemap, structured metadata, Turkish/English support
- [ ] Mobile app using shared API contracts

Exit: live paths tested and no unverified factual fields presented as verified.

## Stage 4: AI and automation

- [ ] Source-licensed import connectors and safe scheduled updates
- [ ] Queue-based processing, retries, idempotence and review dashboards
- [ ] Evidence-grounded buying assistant with transparent rankings
- [ ] Evaluation suite for hallucination, conflicts and stale-data handling
- [ ] Abuse prevention, privacy, affiliate transparency and cost controls

Exit: measured quality and costs, human correction mechanism, security review.

## Stage 5: Release

- [ ] Rights and trademark gate resolved for each target territory
- [ ] Security, dependency license, accessibility, legal and privacy reviews
- [ ] Backup/restore drills and observability
- [ ] Real-world CI/deployment proof; support/takedown procedures
- [ ] Mobile store asset and policy verification if distributing apps

**No self-reported percentage completion, test PASS, deploy or trademark clearance without objective evidence.**
