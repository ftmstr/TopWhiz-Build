# Dragon Point — production adoption acceptance plan

Date: 2026-11-14. State: NOT RELEASED / HARD NO-GO.

## Why GA is not yet justified

Canonical scoring implementation currently declares methodology 1.0.1-draft with DRAFT_CALIBRATION. Among 37 descriptors, 12 curves are preliminary, and 25 metrics have no real calibration at all. Source claims like verified=true and licenseStatus=PERMITTED do not establish independently audited source provenance or redistribution rights.

Live platform also has hard-release blocker Issue #22, the HTTP/R2/CDN media revocation byte-delivery race, plus legal/trademark and licensing checks. Neither a numerically complete synthetic score nor successful UI tests can waive these conditions.

## This feature branch

- Canonical scoring implementation remains packages/dragon-point/engine.mjs.
- New packages/dragon-point/release-gate.mjs exposes mandatory current blockers and fail-closed presentation. It does not accept caller approvals, fabricated score values or synthetic status to authorize a public score.
- Actual Next.js phone detail integrates a Dragon Point card with eight weights; unverified scores display Veri bekleniyor, not 0 or fictional values.
- /dragon-point explains the method, weight breakdown and outstanding conditions using original TopWhiz artwork.
- Dedicated GitHub workflow runs evidence/score-contract tests and frozen-pnpm Next.js typecheck.
- No real phones, data, CMS writes, R2 assets, live deploy or main merge.

## Acceptance matrix

| Requirement | Status | Remaining proof |
| --- | --- | --- |
| Eight weights sum to 1,000 | Implemented | Independent review |
| 37 metric registry | Implemented | Domain review |
| Deterministic scoring engine | Implemented | Real-device reproducibility |
| Provisional raw-reference curves | 12 | Independent calibration |
| Missing real-reference curves | 25 | Accepted empirical measurement protocol and curve |
| Fair Android/iOS comparisons | NOT VERIFIED | Cross-platform method study |
| Third-party benchmark rights | NOT VERIFIED | Actual commercial rights and redistribution grants |
| Device and variant binding | Metadata validation | Independent provenance attestation |
| Confidence intervals | NOT VERIFIED | Lab repeatability and uncertainty assessment |
| Public numerical scoring | BLOCKED | Signed and versioned real-score approval pipeline |
| Full site production | HARD NO-GO | Issue #22 and legal/security clearance |

## Path to final

1. Calibrate all 37 submetrics using defined physical test conditions, fixed reference anchors and independent reviewers.
2. Eliminate correlated performance double-counting and document cross-platform and foldable-device treatment.
3. Record immutable real-device measurement proofs, per-test benchmark major/mode and rights clearances.
4. Implement versioned and human-reviewed production publication records with server-side authorization; never consume client-stated permission as sufficient.
5. Prove numeric score integrity with physical-device data, uncertainty and conflict cases, concurrent writers and rollback tests.
6. Resolve Issue #22, legal and trademark gates before main merge and live publication.

## Verification

From repository root:
- node --test packages/dragon-point/tests/*.test.mjs
- node --test beta/tests/dragon-point.test.mjs
- pnpm install --frozen-lockfile
- pnpm --filter @topwhiz/web typecheck

A blocked release result is intentional and safe, not a failure to calculate synthetic demo points. A successful CI run is not permission to publish uncalibrated real-device scores.
