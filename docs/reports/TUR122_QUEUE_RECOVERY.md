# TOPWHIZ TUR122 — Queue recovery and original outbox provenance — 12 November 2026

No production broker, Queue, DLQ, outbox, receipt, lease, R2 or database write was made. The new HTTP/2 single-flight regression cannot be used to claim Queue recovery correctness.

- Original outbox canonical SHA is immutable; compare the original payload bytes and strict route allowlist. Do not accept reconstructed or rewritten receipts.
- Parallel brokers, Queue/DLQ workers, lease expiry/reacquisition and receiver ACK must be idempotent. Lost COMMIT ACK is **UNKNOWN**, not proof of rollback or publication.
- A delayed HTTP 304, shared content ETag, L1/L2 entry or coalesced promise must not promote a revoked generation or replay an old Queue receipt into a new publication right.
- Dedicated TUR122 CI reruns TUR030 uncertain COMMIT, TUR019 schema ACL, TUR018 canonical route and TUR017 outbox recovery with disposable PG16, alongside inherited HTTP2, IAM and frozen license checks.
- Remote R2/CDN final physical receiver byte, production broker lease and cross-region cache invalidation are **NOT_PROVEN**. Issue #22 OPEN / release NO-GO.

Only synthetic local test media; no live Queue or external mutation. Engineering work-package estimate 75%, not production readiness. Final CI status pending exact report commit.
