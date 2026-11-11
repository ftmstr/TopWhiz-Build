# TOPWHIZ TUR090 — Technical report (2026-11-11)

## Parent and evidence
Stacked parent TUR089 Draft PR #95, HEAD `14a504fb01fc54d99e35a901e5b27e8e2cc09793`, confirmed open/draft and 20 accessible PR-triggered GitHub Actions runs completed SUCCESS, including dedicated run 43025964689. Issue #22 OPEN. TUR090 branch was created from that exact SHA. The connector's commit-workflow endpoint only returns first-page PR-triggered runs; this is not proof of all possible checks.

## Distinct implementation
A new standalone Node.js built-in-only regression file uses a physical loopback HTTP/2 server in a child process, restart with a fresh PID, and a synthetic on-disk generation file. Test A deliberately rehydrates an old generation 1 publisher snapshot after authority advances to generation 2; the restarted process incorrectly serves eight fictional post-revocation bytes (`ABCDEFGH`). Test B reads the generation at accepted-stream tail and request entry: held stream is canceled when generation changes, restarted stale process returns 403, and missing authority returns 403. These are two adversarial tests, not production fixes.

Node 22.16.0 local: 2/2 PASS, plus 10 independent repeat invocations: 20/20 PASS. Dedicated PR-scoped read-only workflow added. The synthetic file is not an independently owned, signed, crash-durable authorization service. No fsync, cross-host coordination, rollback prevention, CDN last-byte delivery, production route, or real Cloudflare/R2 test is claimed. A compromised schema-owner/operator can still mutate authority. A generation read is not an atomic last-byte network barrier.

## Release and untouched gates
No production handler, dependency, lockfile, database schema, real media, DNS, CDN, Queue, R2 or deployment change. Preserve TUR018 12 scenarios / 99,276 fictional PNG bytes and TUR019 cross-isolate bypass. Issue #22 OPEN / release NO-GO. PostgreSQL16 independent IAM, SECURITY DEFINER/schema-owner/CREATE ACL, original outbox canonical SHA and route allowlist, broker/Queue/DLQ ambiguous COMMIT and lease, vinext/workerd stale-cache, Chromium accessibility/SEO/performance, TUR002 frozen pnpm and AGPL/LGPL libvips remain mandatory. Operator IAM, source rights and TOPWHIZ/TOPWIZ trademark approval absent. PostgreSQL, workerd, Chromium, Queue and license checks were NOT_RUN locally in this TUR. Final report commit's GitHub CI must be verified independently; pending is not success.

No main merge, Cloudflare Preview/deploy/Queue/R2/CDN/cache purge, Neon/prod database, DNS/domain, real content/media/prices/merchant feed or AdSense. Estimated engineering work-package progress remains 75%; this is NOT a production-readiness percentage.
