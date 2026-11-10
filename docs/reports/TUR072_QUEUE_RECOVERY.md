# TUR072 Queue Recovery — unchanged / inherited
This test-only tour does not alter original outbox canonical SHA, route allowlist, revocation COMMIT receipt, Queue/DLQ lease, retry idempotence or broker ACK. Concurrent broker/lease and uncertain COMMIT must continue to fail closed. No live Queue/DLQ, R2, Neon or Cloudflare calls performed. Existing integration gates remain required; they were not rerun locally in this tour. Do not infer Queue recovery from 4 local Node contract tests.

---

## Real disposable PG16 + original CMS HTTP extension (TUR072)

# TUR072 Queue/DLQ — COMMIT, cancellation ownership and immutable outbox

New guardian-owner `BEGIN; UPDATE approved=false,generation=2; COMMIT;` executes in a distinct authenticated real PG16 session while another backend remains inside an active SQL statement, whose HTTP client has physically disconnected. Guardian-reader's independent SELECT confirms a LOCAL acknowledged transaction. Fresh actual HTTP denies 404/zero bytes. This is not a lost COMMIT acknowledgement test; inherited TUR030 actual PG TCP-cut uncertain-COMMIT readback remains its own evidence.

An application AbortSignal does not cancel an already dispatched PostgreSQL statement; a different unauthorized guardian-reader cannot issue `pg_cancel_backend` against a media-reader session, and a privileged CI-only admin can explicitly cancel with SQLSTATE 57014. That admin operation cannot be generalized into cross-tenant production IAM.

No change to original outbox record SHA, canonical URI/route allowlist, SHA-pinned receipt, Queue/DLQ producer/consumer, broker leases, parallel replay, retry/idempotency or staging. Inherited TUR017/TUR018/TUR019/TUR029 real PostgreSQL guards must pass. Consumer connection close, server response `finish`, local COMMIT acknowledgment and simulated peer ACK are distinct; none establishes receiver final-byte acceptance or global CDN cache purge. Issue #22 OPEN, RELEASE NO-GO.
