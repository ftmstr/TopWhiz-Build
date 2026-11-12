# TUR128 SECURITY — fail-closed quarantine is a physical session boundary, not an authorization fix
Date: 2026-11-12. HARD NO-GO. This tour preserves the TUR124–127 negative evidence that an already active SET ROLE can survive independent membership REVOKE COMMIT; neither an attempted transactional DISCARD ALL nor a rollback proves identity sanitation.

## New acceptance predicates
1. Distinct non-superuser rights-admin commits REVOKE before B's stale private read; membership SET false, yet stale active executor read succeeds (negative evidence).
2. DISCARD ALL inside transaction fails SQLSTATE 25001; ROLLBACK still leaves executor active.
3. B is destroyed, not returned idle: `release(true)`, pool.totalCount=0 and idleCount=0.
4. New C physical backend has distinct PID/backend_start, session_user=current_user=broker; private read and SET ROLE denied SQLSTATE 42501.
5. D safely reuses clean C backend; no stale role survives. No pg_signal_backend or superuser for broker/admin.
6. All checks run only in disposable local PG16; no real production permission changes.

## Residual threat model
This test does not prove physical teardown on every production error, no cancel-after-release race, no pool epoch binding, no cross-process authoritative lease, and no durable revocation fence across R2/CDN/receiver bytes. Schema-owner, SECURITY DEFINER default PUBLIC EXECUTE, CREATE ACL, owner-transfer and independent IAM remain hard release gates. Issue #22 OPEN: TUR018 99,276 fictional bytes/12 scenarios and TUR019 cross-isolate bypass remain unresolved. No production patch; release NO-GO.