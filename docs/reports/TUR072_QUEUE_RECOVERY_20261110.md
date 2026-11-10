# TUR072 Queue/DLQ — COMMIT, cancellation ownership and immutable outbox

New guardian-owner `BEGIN; UPDATE approved=false,generation=2; COMMIT;` executes in a distinct authenticated real PG16 session while another backend remains inside an active SQL statement, whose HTTP client has physically disconnected. Guardian-reader's independent SELECT confirms a LOCAL acknowledged transaction. Fresh actual HTTP denies 404/zero bytes. This is not a lost COMMIT acknowledgement test; inherited TUR030 actual PG TCP-cut uncertain-COMMIT readback remains its own evidence.

An application AbortSignal does not cancel an already dispatched PostgreSQL statement; a different unauthorized guardian-reader cannot issue `pg_cancel_backend` against a media-reader session, and a privileged CI-only admin can explicitly cancel with SQLSTATE 57014. That admin operation cannot be generalized into cross-tenant production IAM.

No change to original outbox record SHA, canonical URI/route allowlist, SHA-pinned receipt, Queue/DLQ producer/consumer, broker leases, parallel replay, retry/idempotency or staging. Inherited TUR017/TUR018/TUR019/TUR029 real PostgreSQL guards must pass. Consumer connection close, server response `finish`, local COMMIT acknowledgment and simulated peer ACK are distinct; none establishes receiver final-byte acceptance or global CDN cache purge. Issue #22 OPEN, RELEASE NO-GO.
