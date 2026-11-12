# TOPWHIZ TUR121 — Security report — 12 November 2026

**Issue #22 OPEN / HARD RELEASE NO-GO.** Preserve TUR018 12 fictional interleavings / 99,276 synthetic PNG bytes after withdrawal and TUR019 cross-isolate bypass. A successful local test of a guarded mock is not a production remedy.

## Distinct attack path
An origin HTTP 304 response only validates an ETag representation; it does not authorize publication. Two pending old-epoch 304 replies are released after authority transition ACK. A shared L2 ETag entry belonging to tenant A is promoted into tenant B's L1 entry by a deliberately unsafe gateway. The unsafe path delivers 8 fictional AOLD bytes after ACK (4 first delivery and 4 L1 hit). Concurrently, tenant B's publication generation and ETag change from v1 to v2. The guarded local model rejects the held v1 response on generation mismatch, binds both cache tiers to tenant+asset+generation, returns fresh BNEW for v2, and fails closed if authority is unavailable.

## Non-claims and blockers
Already queued/sent bytes cannot be recalled. No actual distributed revocation fence, global CDN invalidation, remote R2/CDN final physical receiver byte or receiver ACK was proven. The test is localhost HTTP/2, not a real Cloudflare edge/worker/stream consumer. Independent operator IAM and legal media source rights, TOPWHIZ/TOPWIZ trademark clearance, and external review are outstanding. Existing PostgreSQL16 SECURITY DEFINER/schema-owner/CREATE ACL, inherited group EXECUTE, pooled PID/lease, original canonical outbox SHA/route allowlist and broker/Queue/DLQ uncertain COMMIT are preserved by CI; do not grant global pg_signal_backend or service superuser.

**No main merge or live Cloudflare Preview/deploy/Queue/R2/CDN/cache purge, Neon/prod DB, DNS/domain, real media/content/prices/merchant feeds or AdSense.** Work-package estimate 75% only. Exact final SHA CI must be separately checked.
