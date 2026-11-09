# TUR037 Queue recovery

No Queue or broker behavior changed. Inherited original canonical outbox SHA and route allowlist, parallel DLQ/lease and uncertain COMMIT suites remain mandatory. New workflow includes TUR017 and TUR018 and real PG16 inherited checks. Real broker restart, distributed lease and unknown COMMIT in production are NOT_RUN. No exactly-once claim.
