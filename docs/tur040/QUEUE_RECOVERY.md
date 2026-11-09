# TUR040 Queue recovery boundary

New stream test does NOT exercise a broker, Queue, DLQ, lease, transaction ACK, or original outbox delivery. Inherited PG16/outbox CI includes TUR017 original canonical SHA recovery, TUR018 route allowlist, TUR019 ACL and TUR030 uncertain COMMIT. These are local test gates only; concurrent real broker, lease expiry, DLQ replay and uncertain COMMIT across production infrastructure are NOT_RUN. Reject any claim of exactly-once or globally synchronized rights withdrawal. Keep release NO-GO.
