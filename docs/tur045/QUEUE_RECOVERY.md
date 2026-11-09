# TUR045 Queue recovery

No production Queue, broker, DLQ, lease, outbox or PostgreSQL mutations. Preserve original canonical outbox SHA and route allowlist, independently authenticated PostgreSQL16 schema-owner/SECURITY DEFINER/CREATE ACL tests, parallel broker/DLQ COMMIT ambiguity, lease/restart and fail-closed recovery. Existing inherited tests are not replaced. This turn's synthetic in-memory queues are NOT durable broker evidence.
