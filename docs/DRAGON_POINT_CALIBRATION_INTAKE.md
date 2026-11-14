# Dragon Point — Calibration intake workbench (research only)

**Version:** 1.0.1-draft | **Release:** HARD NO-GO | **Scope:** smartphone laboratory measurement evidence.

## Purpose

The production point engine cannot honestly assign real-device Dragon Points yet: 25/37 metric definitions have no calibration protocol and the other 12 have only provisional anchors. This module makes it possible for TWA3 and human researchers to **prepare** reproducible evidence without turning user-provided claims into production approval.

The canonical file is `packages/dragon-point/calibration-intake.mjs`. It imports the frozen 37-metric registry from `packages/dragon-point/engine.mjs`. It does not call an external service, mutate approved anchors, create scores, modify CMS records, or approve data rights.

## Intake contract

Call `calibrationBacklog()` to retrieve the exact 12 preliminary and 25 uncalibrated metric IDs. Every item is pending independent methodology/rights review.

Call `assessCalibrationCandidate({metricId,methodologyVersion,asOfDate,samples})`.

Each measurement sample includes:
- Unique sampleId and the exact metricId.
- Canonical deviceId and regional hardware variantId, repeated identically in evidence.
- Finite raw numeric value and exact unit (never caller-supplied normalized ratios).
- evidence.kind = INDEPENDENT, verified = true, licenseStatus = PERMITTED, sourceUrl = HTTPS, measuredAt = YYYY-MM-DD.
- Benchmark suite, major and mode exactly matching the provisional registry, **or** a candidate measurement protocol tag for an uncalibrated metric.
- Same input methodology version (currently 1.0.1-draft) and an explicit valid asOfDate no earlier than measurements.

**Important:** Fields such as verified and licenseStatus are **untrusted declarative metadata**, not proof of permission or testing. No network retrieval or independent license audit occurs in this module. An HTTPS URL metadata check is not an SSRF-safe fetch authorization.

## States

| State | Meaning | Publishes points? |
| --- | --- | --- |
| REJECTED | Invalid, unsafe, out-of-date, duplicated or cross-device input | No |
| COLLECT_MORE_EVIDENCE | Fewer than 3 distinct device-variant samples | No |
| NEEDS_PROTOCOL_CALIBRATION | Candidate protocol for one of the 25 uncalibrated submetrics | No |
| REQUIRES_REVIEW | Preliminary protocol has 3+ distinct variants, but independent expert/rights review is still missing | No |

The module exports **observedRange** (minimum and maximum measured physical values), not normalisation anchors. It never returns approvedAnchors or a Dragon Point score, irrespective of caller approval booleans. Three samples is a **minimum queue triage requirement**, not statistical evidence that calibration is sufficient. The number of distinct source hostnames is diagnostic only, not a claim of source independence.

## Independent calibration process — mandatory before GA

1. Define reproducible laboratory tests for each of 37 metrics: exact firmware/OS, test application version, mode, ambient conditions, temperature, power state, battery age and accessibility constraints as appropriate.
2. Use an independently reviewed cross-device sampling plan, multiple physical trials and calibrated test equipment; measure repeatability and uncertainty, not just observed range.
3. Verify source authenticity, redistribution rights, claim ownership and licensing. Keep an immutable raw-data digest and rights approval receipt under controlled access.
4. Review Android/iOS comparability, foldable displays, cross-platform benchmark availability, overrepresented CPU/GPU correlations and normalisation bias.
5. Propose signed and versioned reference anchor curves **after** data review, test calibration against holdout devices and independently approve them.
6. Implement server-only immutable approval records, audit/event logs and human editorial release controls; maintain Issue #22 HARD NO-GO until independently cleared.
7. Only then release a **new** approved methodology version. Do not silently upgrade 1.0.1-draft or rely on a client-supplied approval flag.

## Verification

Run from repository root:

    node --check packages/dragon-point/calibration-intake.mjs
    node --test packages/dragon-point/tests/*.test.mjs

The existing Dragon Point workflow runs these tests and frozen-pnpm Next typecheck. No live traffic, real benchmark data ingestion, database migration, Cloudflare deployment or image publishing is performed.
