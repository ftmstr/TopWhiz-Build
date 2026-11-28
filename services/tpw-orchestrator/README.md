# TOPWHIZ TPW Cloudflare Orchestrator — CI-only

STATUS: DRAFT / HARD NO-GO. No Cron Triggers enabled, no D1 provisioned, no feed/API credentials, no GitHub App installed, no live deployment. Existing TWA1/TWA2/TWA3 ChatGPT hourly tasks were NOT modified or duplicated.

## Runtime modules
- src/index.mjs: Cloudflare scheduled handler and durable WorkflowEntrypoint.
- Proposed UTC: TPW1 minute 00, TPW3 minute 20, TPW2 minute 40, once per hour.
- src/adapters.mjs: bounded allowlisted HTTPS JSON feed. No full copied article or image.
- src/policy.mjs: original bilingual TR/EN content, source, rights, newsroom/atlas differences.
- src/lineage.mjs: SHA-256 ties TPW2 output to an original prefiltered candidate, including primary source URL and phone model/SKU/region.
- src/staging.mjs plus migrations: minimal metadata D1 with two-hour application TTL, deduplication. D1 database and binding NOT created; TTL is not secure deletion of backups.
- src/runner.mjs: TPW1/TPW3 stage, TPW2 verifies structure and quarantines failures.
- src/github-app.mjs: RS256 GitHub App JWT and narrow installation token; only a separately verified PRIVATE repository ftmstr/TopWhiz-Content-Private and branch content-approved-pilot. This private repo does not yet exist or is unverified. No write to public TopWhiz-Build repo.
- GitHub Actions CI: read-only, Node.js 22 tests, no deploy, no automatic merge.

## Test locally from monorepo root
  node --test services/tpw-orchestrator/tests/*.test.mjs
  node services/tpw-orchestrator/scripts/validate-approved.mjs content-approved

## Default HARD NO-GO
wrangler.jsonc contains triggers.crons=[], TPW_MODE=CLOSED, TPW_RELEASE_GATE=CLOSED and TPW_GITHUB_WRITES=DISABLED. Do not enable without explicit authorization and all issue/media/brand/Dragon Point gates reviewed.

## Pilot prerequisites — NOT performed
1. Create and verify a separate private content repository and narrowly-scoped GitHub App.
2. Store the RSA private key only as a Cloudflare secret using PKCS#8 PEM; convert GitHub's traditional RSA PEM to PKCS#8 offline. Never commit private keys or PATs.
3. Provision Cloudflare Workflows and dedicated D1 staging, run migration, ensure independent TTL and backup/log retention controls.
4. Configure licensed feed adapters and an authenticated editor API with independent trustworthy source review and source attestation. Self-declared AI VERIFIED flags do NOT prove rights/facts/translation correctness.
5. Run actual workerd/Wrangler tests and private pilot review. Issue #22 rights-revocation fence, physical Safari/Android, brand/media licenses and 37 Dragon Point criteria remain NOT_VERIFIED.

No live content, domain, Cloudflare deployment, GitHub public content, API keys or release was created in this phase.
