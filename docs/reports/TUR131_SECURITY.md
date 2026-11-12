# TOPWHIZ TUR131 — Security threat model and fail-closed boundaries

Physical PostgreSQL COMMIT success and client acknowledgement are different facts. A lost COMMIT ACK must not be treated as rollback, a right to replay publication, or a durable media entitlement. TUR131 uses a localhost-only protocol relay to discard PostgreSQL CommandComplete COMMIT + ReadyForQuery after the server has executed COMMIT. An independent new connection checks durable synthetic state; an idempotent unique key prevents duplicate side effects. The proxy is test-only, never a production IAM or Queue gate.

All database writes are in a randomly named disposable test table under the explicit `CI=true`, `TUR131_DISPOSABLE_PG16=1`, loopback PostgreSQL16 guard. No global pg_signal_backend, production roles, SECURITY DEFINER, schema owner or CREATE ACL changes. Inherited tests must keep independent rights-admin/owner role separation and revoke behavior.

Issue #22 remains OPEN / HARD NO-GO. TUR018 12 scenarios / 99,276 synthetic leaked bytes and TUR019 cross-isolate bypass remain negative evidence; the R2/guardian/CDN final receiver byte is NOT_PROVEN. No release without independently approved operator IAM, media source rights and TOPWHIZ/TOPWIZ trademark clearance.
