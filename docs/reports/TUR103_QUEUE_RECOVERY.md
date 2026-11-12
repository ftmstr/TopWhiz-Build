# TOPWHIZ TUR103 — Queue, outbox and recovery invariants

This change adds test/workflow/reports only. No publisher, schema, outbox, R2, broker, Queue, DLQ, receipt, lease or recovery production code changed. A gateway redirect or origin HTTP/2 response is not a durable broker ACK, original outbox canonical SHA, route allowlist validation, COMMIT confirmation, or remote receiver acknowledgement. A correctly signed stale grant must not become an alternate recovery route to bypass revoked media rights.

Dedicated CI retains disposable PostgreSQL16 TUR096–098 independent-login and pooled cancellation checks, TUR019 SECDEF/CREATE ACL, TUR018 canonical outbox route/SHA, TUR017 DLQ recovery and TUR030 ambiguous COMMIT. Independent parallel broker/lease replay and live Cloudflare Queue/DLQ are NOT_RUN. No fabricated broker receipt or production recovery claim. Issue #22 OPEN; release NO-GO.
