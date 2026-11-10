# TUR054 technical report — synthetic negative evidence
Parent: TUR053 HEAD 530f43911c3d822b4c9360c1c223bbf0ca15bcdb. Separate stacked Draft PR, no main merge.
Four Node built-in tests cover ACK loss after durable reservation, independent ledger duplicate acceptance, already queued bytes after revocation, and final receiver-byte non-proof. No production code, dependency or lockfile changes. These are model counterexamples, not a real R2/CDN or browser acceptance.
TUR053 real local Next HTTP / PG16 CI 20/20 visible PR-triggered workflow runs SUCCESS on exact HEAD, first page only. TUR054 final-HEAD CI must be independently verified; no inference from ancestor SHA.
Estimated engineering work-package progress: 80% (not production readiness). Issue #22 remains OPEN, release NO-GO.
