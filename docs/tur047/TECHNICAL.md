# TUR047 technical report — 2026-11-10
Parent TUR046 HEAD: d6c0b686e96c3ac9c0bc4db038dafe8a3d425fd8.
Scope: eight deterministic synthetic Node tests covering six ACK claim scope substitutions, exact matching ACK without receiver proof, and duplicate ACK without receiver proof. Tests encode a deliberately conservative model, NOT production validation or a distributed-fence fix.
New workflow: .github/workflows/tur047-ack-claim-scope-negative.yml.
Preserve all inherited checks: TUR002 frozen pnpm, TUR018 12 interleavings/99,276 fictional bytes, TUR019 cross-isolate bypass, TUR041 real local Next/PG16 negative test, Chromium accessibility/SEO/perf and vinext/workerd stale-cache.
Final HEAD CI is NOT verified at report authoring time; review latest commit checks before acceptance. No main merge or production actions. Estimated engineering work-package progress 74% (not production readiness).