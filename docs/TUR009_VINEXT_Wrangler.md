# TOPWHIZ TUR009 — Wrangler / vinext compatibility record

## Reproducible Wrangler pin

Before: prices-worker devDependency Wrangler 4.131.0.
After: Wrangler **4.135.0**, minimum for Workers Previews per official docs.
The TUR009 branch lockfile was resolved by a scoped, single-use GitHub Actions
workflow executing pnpm install --lockfile-only --ignore-scripts.
The updater had explicit permission to push to the TUR009 branch only and was
removed after successfully committing pnpm-lock.yaml. main was not touched.

Verify with:
- pnpm install --frozen-lockfile
- pnpm --filter @topwhiz/prices-worker exec wrangler --version
- pnpm worker:check  (wrangler deploy --dry-run, NEVER deploy)
- pnpm cms:dry-run (Queue Worker bundle only)
- node scripts/tur008-preview-preflight.mjs static

## Next.js/vinext

Next.js remains the production build command in apps/web, not vinext.
Current vinext 1.4.4 provides a compatibility static scan (95% compatible,
10 supported, one partial, zero issues on TUR008).

TUR009 added an isolated vite.config.ts with vinext() so the experimental
GitHub Actions job can attempt a real local App Router Vite/vinext build.
The first attempt failed for missing Vite config; the second reached RSC
dependency validation, then required @vitejs/plugin-rsc.
Further disposable-runner probes installed optional @vitejs/plugin-rsc
without changing committed dependencies and revealed that vinext 1.4.4
requires React, react-dom and react-server-dom-webpack >=19.3.1.
The tracked production app remains on React 19.2.0; migration must be
tested and approved separately, not silently switched by a Draft PR.

No real workerd/vinext Cloudflare plugin, real HTTPS preview origin, Access
auth or live Worker is created by any TUR009 command. A passing local
Node/Vite build, if achieved, would still not prove Cloudflare runtime or
public release readiness.

Official references:
- https://developers.cloudflare.com/workers/previews/get-started/
- https://developers.cloudflare.com/workers/wrangler/install-and-update/
- https://github.com/cloudflare/vinext
- https://vinext.dev/docs/deploying/cloudflare

**Do not call any real wrangler preview/deploy, vinext-cloudflare deploy,
domain mutation or production credentials during this tour.**
