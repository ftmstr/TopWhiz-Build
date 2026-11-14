# TOPWHIZ Dragon Point 1.0.1-draft — Technical specification

**Status: RESEARCH / STATIC BETA ONLY. NOT a calibrated real-phone leaderboard.**

## Implementation

- Canonical pure ECMAScript module: packages/dragon-point/engine.mjs
- Identical static browser copy: beta/assets/dragon-point.mjs
- Static beta UI: beta/index.html, beta/assets/site.js, beta/assets/site.css
- CI compares the two modules byte-for-byte and runs Node unit tests and Chromium desktop/mobile.
- No remote requests, real devices, pricing, CMS writes, databases, or production deployment.

## The eight category weights

| Category | DP | Submetrics |
| --- | ---: | --- |
| Performance | 250 | CPU single 35; CPU multi 45; primary GPU 55; secondary GPU 20; sustained 45; AnTuTu system 25; storage 15; responsiveness 10 |
| Camera | 190 | photo 70; video 50; zoom 25; selfie 25; consistency 20 |
| Display | 175 | sustained brightness 45; PPI 20; refresh 25; HDR 30; color 25; comfort 30 |
| Battery and charge | 135 | endurance 70; charge 35; efficiency 15; longevity 15 |
| Software | 90 | OS support 40; security support 25; accessibility 15; experience 10 |
| Connectivity | 60 | cellular 25; Wi-Fi 15; USB 10; wireless extras 10 |
| Design | 60 | resistance 25; materials 15; ergonomics 20 |
| Audio | 40 | speakers 20; microphones 10; haptics 10 |
| **TOTAL** | **1000** | **37 submetrics** |

Every score = metric weight × normalized ratio (0..1). Fixed piecewise linear anchor curves, never dynamic leaderboard min/max. Display anchors: PPI 250→0, 300→.35, 400→.85, 450→1; sustained full-screen brightness 450 nit→0, 800 nit→.5, 1300 nit→1; refresh 60 Hz→.4, 90→.7, 120→1. Charge minutes use a reverse curve.

**Calibration warning:** The benchmark anchor ranges and metrics are illustrative design assumptions, not independently calibrated reference values. Only a limited set of submetrics has a preliminary raw-measurement curve; the remaining metrics deliberately have NULL calibrations. The engine will reject uncalibrated real measurements rather than make up a score. No real phone can presently obtain an approved Dragon Point.

## Evidence and guardrails

- Real evidence requires HTTPS source, source kind, asserted verification, PERMITTED license status, ISO measurement date, raw numeric value, exact units and where applicable benchmark suite/major/mode or measurement protocol.
- Every **real** evidence record must carry canonical evidence.deviceId and evidence.variantId identical to the calculation input; cross-device or cross-region benchmark credit is rejected.
- Caller must supply explicit and valid asOfDate (YYYY-MM-DD) for real evidence. Future measurements relative to that date are rejected. The clock is **not** inferred from browser wall time: identical input and as-of date give identical results.
- Source URL metadata rejects login credentials, IP literals, localhost, special-use intranet hostnames and nonstandard HTTPS ports. This metadata check does **not** perform DNS resolution and must never be repurposed as an SSRF-safe fetch authorization.
- Calibration anchor tuples and benchmark metadata are deeply frozen so importers cannot mutate scoring curves at runtime.
- These fields are *claims at the module interface*, not independent proof of a real legal license or lab accreditation; ingestion and rights review must happen separately.
- Any duplicate metric, malformed value, source/rights problem, version mismatch, unexpected manually-normalized real score, or synthetic/real mixture yields REJECTED.
- Unknown measurements are not zeros. An incomplete device receives weighted coverage, category known points and best/worst numeric bounds, but no exact point total. Partial bounds round **outward** (floor minimum, ceil maximum), never excluding plausible fractional points; exact complete scores remain exact single-point bounds.
- The 37-value fictional test profile produces DEMO_ONLY. No demo score is publishable.
- An otherwise complete real-evidence result remains RESEARCH_ONLY under DRAFT_CALIBRATION. Every result currently returns publishable=false.
- No price or marketing claim feeds the technical score. Different benchmark major versions are not considered interchangeable.

## Versioning

Draft 1.0.1 tightens the input contract for real measurements: canonical device/variant binding and deterministic asOfDate are mandatory; private/literal source URL metadata is rejected; calibration anchors are deep-frozen; partial score bounds conservatively round outward. The eight category weights and all 37 submetric weights are unchanged. Draft scores remain **unpublishable** and must not be treated as official device ratings.

## Production GO gates (not yet met)

1. Independently calibrate all 37 metrics and publish measured protocols, units, fixed reference anchors, uncertainty, repeatability and inter-platform fairness.
2. Resolve correlated tests, iOS/Android gaps, regional variants, benchmark versions, test age and frozen methodology recomputation.
3. Verify third-party benchmark/image/data usage rights, provenance and immutable evidence.
4. Establish device/variant keyed score records and human review gates in authorised CMS/PostgreSQL/Next.js without privileges to deploy or change R2 rights.
5. Test accessibility, HTTP and browser rendering, input abuse, numeric limits and test tampering.
6. Preserve Issue #22 HARD RELEASE NO-GO and the outstanding media, trademark, AGPL/LGPL and infrastructure checks.

## Verification

Real evidence input example shape (fictional documentation example, **not** an observed benchmark):

    { deviceId: 'phone-123', variantId: 'tr', asOfDate: '2026-11-14', observations: [{
      metric: 'display.ppi', value: 420, unit: 'ppi',
      evidence: { kind: 'INDEPENDENT', verified: true, licenseStatus: 'PERMITTED',
        deviceId: 'phone-123', variantId: 'tr', measuredAt: '2026-11-12',
        sourceUrl: 'https://example.org/benchmarks/fictional' }
    }] }

The sample `verified` and `licenseStatus` flags are untrusted **assertions**; do not infer independent rights clearance or an actual test from them. A permitted numeric calculation remains research-only while method is draft.

Run from the repository root:

    node --check packages/dragon-point/engine.mjs
    node --check beta/assets/dragon-point.mjs
    node --check beta/assets/site.js
    cmp packages/dragon-point/engine.mjs beta/assets/dragon-point.mjs
    node --test beta/tests/*.test.mjs

Existing beta workflow adds a real Chromium mobile/desktop check. The beta devices and scores are conspicuously marked FICTIONAL/DEMO, and no real device, price or benchmark is shown. Existing dragon logo reused without modification.
