# TUR041 Queue/DLQ and unknown COMMIT

The new PG16 rights COMMIT and local HTTP output demonstrate the difference between durable rights state and media delivery acknowledgement. They are not Queue ACK, original canonical outbox SHA evidence, a broker lease, CDN-wide invalidation, or exactly-once remote receipt. No broker, Queue, DLQ, outbox, migration or lease implementation was changed. Inherited TUR018/017 tests continue to gate original SHA/route allowlist, concurrent retry and ambiguous COMMIT behaviour; TUR030's real TCP COMMIT cutoff stays a negative boundary.

Live Cloudflare Queue/R2, global edge cache purge, end-receiver last-byte acknowledgement and production IAM remain NOT_RUN/NOT_PROVEN. No automatic re-admission after unknown COMMIT, no lease-only false confirmation and no live publication. RELEASE NO-GO.
