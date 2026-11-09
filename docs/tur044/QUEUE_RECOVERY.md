# TUR044 Queue / recovery

No Queue, broker, DLQ, outbox, lease, or PostgreSQL recovery code changed. Existing original canonical outbox SHA/route allowlist, uncertain COMMIT, independent broker/lease and idempotency gates remain required. New synthetic stream test does not establish Queue recovery correctness. Existing CI coverage must be independently checked on the exact final commit. Production Queue/R2/CDN/cache purge and Neon are prohibited.
