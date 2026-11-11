# TUR078 Queue recovery — 2026-11-11
No Queue/DLQ or outbox production code changed. Preserve inherited canonical original outbox SHA/route allowlist, ambiguous COMMIT reconciliation, idempotent retry, parallel broker leases and receiver ACK constraints; this narrow PG16 test does not revalidate them. No live Queue actions. Inherited gates must remain required for any release.
