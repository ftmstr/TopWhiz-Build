# TUR033 Technical — 2026-11-09

Baseline: TUR032 Draft PR #36 HEAD ec6e90608683d6151727622e5d49425b8f87e123, 20/20 GitHub Actions SUCCESS at that SHA.

New actual CMS handler test sends five Range/If-Range/If-None-Match/If-Modified-Since variations against original synthetic PNG bytes staged into an in-memory R2 substitute. The handler intentionally returns a full 200 response rather than a 206/304; after revocation all variants and HEAD return 404. This is a concrete request-surface regression, not a distributed revocation solution. The earlier TUR032 real PG16 independent LOGIN and local HTTP race remains in CI. TUR018 12 scenarios / 99,276 negative bytes and TUR019 cross-isolate evidence remain release blockers.

No real CDN/R2, remote final-byte receipt, proxy-to-client end-to-end proof, or production IAM. Issue #22 OPEN; NO-GO. No main merge or deployment. Progress estimate: 62/100 weighted engineering points, NOT production readiness.
