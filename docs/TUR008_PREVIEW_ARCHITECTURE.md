# TOPWHIZ TUR008 — Cloudflare/vinext secure preview architecture

**Proposed design only. NO PREVIEW DEPLOYMENT, DNS OR PRODUCER BINDING.**

## Critical compatibility facts

- Cloudflare's November 2026 Next.js integration recommends vinext (beta); currently
  installed vinext 1.4.4 is tested with \`pnpm --filter @topwhiz/web compat:check\`.
  This is a **static scan**; it is NOT the same as \`vinext build\` in a Worker runtime.
- Cloudflare Workers branch **Previews** require Wrangler **4.135.0+**.
  This repository currently pins Wrangler **4.131.0**, therefore the
  \`wrangler preview\` gate is BLOCKED until the pin/lockfile are deliberately
  updated and CI reverified. No command in TUR008 uploads a Preview.
- Branch previews are **public by default** unless Cloudflare Access or the
  account's Preview Access policy is enabled. Use identity-based Cloudflare
  Access, short-lived secrets and dedicated preview-only test resources.
- Worker \`workers.dev\` preview URLs receive noindex header by default,
  but this alone is not authorization. Apply **both** Access gate and
  \`X-Robots-Tag: noindex, nofollow, noarchive\` in every preview response;
  avoid SEO exposure of fictional test data.

Official docs:
- https://developers.cloudflare.com/workers/previews/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- https://developers.cloudflare.com/queues/configuration/dead-letter-queues/

## Future authorized preview isolation

1. A human explicitly approves a private Cloudflare test account/namespace
   and a non-production GitHub Preview integration. Never use main/production
   tokens, database URLs, R2 buckets, queues, DNS routes or Google ad IDs.
2. Upgrade pinned Wrangler with a renewed frozen pnpm lockfile. Run vinext
   compatibility checks, Next.js/Worker real runtime build and unit tests.
3. Configure each PR with a separately scoped branch Preview, Cloudflare
   Access login, temporary credentials and a non-production database schema.
4. Use fictional/dev-generated fixtures, no real website feeds, no customer
   data or retailer offer imports. Source signature verification and rights
   reviews still apply. Keep top/right/bottom Ads as placeholders only.
5. Configure R2 test bucket, Queue consumer, and a separate same-jurisdiction
   **DLQ** with max_retries=5. The checked-in sample file is **not active**;
   real wiring and Secret Store bindings are still needed.
6. Fail closed on revoked rights and image hash mismatches; verify Cache purge
   across the zone and DLQ redrive instructions before enabling repeatable jobs.
7. Preview health: noindex + auth required, route and secret isolation tested,
   screenshot/mobile a11y/performance and rollback captured. Manual approval
   before even publishing to a preview URL. No auto deploy from this Draft PR.

## TUR008 non-deploy gates

- \`node scripts/tur008-preview-preflight.mjs static\` tests no Ads keys,
  disabled active Queues consumer, private sample constraints and empty content.
  It also **reports** the Wrangler 4.135+ version blocker.
- \`pnpm ... compat:check\`, TypeScript and both Wrangler \`--dry-run\`
  continue in GitHub CI. They compile locally and use no real Cloudflare API.
- Credential setup, actual Cloudflare Access, preview URL, vinext runtime
  acceptance, R2 and Queue provisioning are **NOT_RUN**.

**Do not enable preview builds automatically** on a public PR while trademark,
licensing, role setup, private resource isolation and Cloudflare Access are open.
