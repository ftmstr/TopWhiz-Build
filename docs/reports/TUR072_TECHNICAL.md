# TUR072 Technical — 2026-11-10
Parent: TUR071 exact HEAD ad4e588a5b46aa23cbeff345116ba647e9feed66, Draft PR #77.
Scope: four deterministic regression tests on original createGuardianApprovalLookup: abort during pending media SQL; abort during pending guardian SQL; per-request isolation; already-dispatched SQL completion.
Local Node 22 smoke test: 4/4 PASS against an exact-behavior local copy of the TUR071 guardian contract. The repository GitHub CI must independently verify the committed original module; do not treat local smoke as exact-HEAD CI.
No deployed Worker/Next adapter change, no real PostgreSQL driver cancellation proof, no Cloudflare/R2/CDN or last network byte proof. TUR071 real TCP 4136/8273 upstream cancellation evidence remains separate from TUR068 uncancelled 8273/8273 and TUR069 irreversible 25 bytes.
Issue #22 OPEN / NO-GO. Work-package coverage estimate 73/100, not production readiness.