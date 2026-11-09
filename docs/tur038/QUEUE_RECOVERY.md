# TUR038 Queue Recovery

No Queue/DLQ or broker implementation change. Preserve immutable original outbox canonical SHA, route allowlist, independent broker/lease and uncertain COMMIT reconciliation gates through inherited CI. HTTP 200, declared Content-Length and local stream completion are NOT broker ACK or durable receiver receipts. Global exactly-once, remote delivery and final-byte acknowledgments NOT_PROVEN; real broker restart NOT_RUN. Release NO-GO.
