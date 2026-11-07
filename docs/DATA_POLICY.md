# TOPWHIZ — Data Provenance, Intellectual Property and Publication Rules

Status: POLICY DRAFT; no acquisition jobs or licenses have been verified.  
Date: 2026-11-07

## Non-negotiable principles

A public device entry must not claim to be an authoritative specification unless its fields have documented evidence. Licensed text, photos, product databases and pricing feeds cannot be mirrored merely because they are viewable online.

### Source tiers

1. **Primary**: official manufacturer press releases and specification sheets; official product support pages; original benchmark publishers, subject to their terms.
2. **Secondary**: reputable independent tests and technical reviewers. Record article date, methodology and source permissions.
3. **Community**: user submissions and forums as research leads; require corroboration and review before factual publication.
4. **AI-extracted**: unverified working notes only, never publication authority by themselves.

## Ingestion lifecycle

`DISCOVERED → RIGHTS_CHECKED → EXTRACTED → NORMALIZED → EVIDENCE_ATTACHED → REVIEWED → PUBLISHED`

At any stage an item may transition to `QUARANTINED` with a reason; corrections must not erase original evidence or audit history.

### Required provenance per fact

- normalized field, raw observation, original unit
- canonical device / variant identity and region
- publisher, source URL or document ID, observed timestamp
- license/terms assessment and necessary attribution
- verification status, reviewer/process identifier and last review date
- source hash or reference for later reproducibility, where legally permitted
- conflict log when sources disagree

## Data-quality rules

- Do not merge materially different regional SKUs or storage/network configurations.
- Benchmark comparisons must record benchmark name and exact version, test conditions, units and date.
- Price observations must carry seller, currency, tax/shipping basis when known, timestamp and territory.
- Editorial and AI recommendations must disclose criteria, evidence limits and affiliate relationships.
- For image assets, prefer owned/licensed manufacturer media under permission; absent evidence of rights, do not publish or redistribute.
- Maintain corrections, takedown and contact procedures for data-rights complaints.

## Operating constraints

- Never bypass paywalls, CAPTCHAs, anti-bot controls or access restrictions.
- Honor provider APIs, robots policies when relevant, explicit licensing agreements and rate limits.
- Keep source code licensing separate from rights in catalog data, photos, benchmarks, logos and third-party API responses.
- Do not assume AGPL-3.0 source-code licensing conveys rights to third-party datasets or brand assets.

## Initial acceptance tests (future)

- Invalid units and conflicting SKUs fail closed.
- Unlicensed images cannot publish.
- An AI-proposed value with no source stays in review.
- Incorrect device merges are reversible and audited.
- Stale prices carry an explicit timestamp and are not presented as current.
- All publishable records expose their evidence chain.
