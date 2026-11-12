# TOPWHIZ TUR121 — Queue recovery and immutable provenance — 12 November 2026

This TUR introduces **no production Queue/DLQ, broker, lease, receipt, outbox or database mutation**. Existing Queue recovery invariants remain mandatory, not inferred from the new HTTP/2 model.

- Original outbox canonical SHA must be immutable and checked against the exact original payload, with route allowlist; no reconstructed/rewritten receipt accepted.
- Parallel brokers, Queue/DLQ lease acquisition/expiry, retries and receiver ACK must be idempotent; COMMIT transport loss is **UNKNOWN**, not proof of rollback or publication.
- Revocation generation fence must not be derived from a content-only ETag or unscoped cache key; stale Queue receipts or delayed 304 cannot restore rights.
- The dedicated TUR121 workflow reruns the existing TUR030 unknown COMMIT, TUR019 SECDEF/CREATE ACL, TUR018 canonical route and TUR017 Queue/DLQ tests with disposable PostgreSQL16 and frozen pnpm.
- Real cross-region R2/CDN final receiver ACK, global cache invalidation, and production IAM remain **NOT_PROVEN**. Keep Issue #22 OPEN and release NO-GO.

The new test uses only fictional media and local ephemeral HTTP/2 ports. No real broker, remote Queue, R2 or Neon operation. Exact final-report-commit CI is the only acceptance evidence. Estimated engineering work-package progress: 75%, not production readiness.
