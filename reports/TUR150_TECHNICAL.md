# TUR150 Technical — 2026-11-13

Parent is TUR149 Draft PR #155, exact HEAD `5e110b0e30205957f718e115d930ee5fd07c7609`, 21/21 GitHub Actions SUCCESS and 58/58 actual jobs SUCCESS. TUR149 special HTTP2 run #43478140746 SUCCESS, four reports. This TUR150 change is additive, with exactly one new disposable, physically connected PostgreSQL16 integration test and its dedicated inherited-security workflow; no production application code change.

## Physical acceptance design
Separate restricted login sessions rights-admin, broker and guardian A/B/C. Test-only random schema, leased PID and millisecond backend_start, tenant, session_user actor, random nonce, monotonic epoch. Broker uses real pg.Pool(max:1). Narrow SECURITY DEFINER owner inherits broker membership solely to demonstrate cancellation without granting the restricted guardians pg_signal_backend or superuser. Rights-admin independently REVOKE COMMITs executor membership, and updates the lease.

**Stage one:** first verified lease check for A blocks on a real advisory lock, B inherits the same physical PID/backend_start, rights-admin updates to B and commits revoke; the second verified lease check refuses A; B SQL completes. Guardian direct pg_cancel_backend is denied 42501.

**Stage two:** B passes both fresh lease checks with proper tenant/actor/nonce/epoch and blocks on a different real advisory lock immediately before pg_cancel_backend. B releases pool connection. Rights-admin rotates lease to tenant C; C starts real pg_sleep SQL on the same PID/backend_start. Release barrier: deliberately NON-ATOMIC test-only helper signals that backend, causing C's live query to fail SQLSTATE 57014. This is a physical counterexample to double-check-as-atomic-cancel.

No production fix or atomic CAS signal guarantee. Inherited workflow re-runs TUR131 real lost COMMIT ACK, TUR132 ROLLBACK command tag, physical PG16 IAM gates, historical HTTP2 and immutable original outbox SHA/Queue/DLQ, frozen pnpm, AGPL/LGPL. Existing Next/workerd/Chromium mobile/desktop a11y/SEO remain independent PR workflows. Real CI outcomes MUST be verified on exact final SHA; test design alone is NOT PASS.

Issue #22 OPEN HARD RELEASE NO-GO. No merge, deploy, live data or external side effects.
