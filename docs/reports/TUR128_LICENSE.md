# TUR128 LICENSE / SUPPLY CHAIN — frozen hold
Date: 2026-11-12. Public ftmstr/TopWhiz-Build only. No dependency, pnpm lockfile, binary asset, real image, price or merchant feed changed in TUR128. The new test uses the repository's existing pg and node:test dependencies. No new external packages.

## Non-negotiable gates
Workflow uses Node 22, pinned pnpm 10.18.3 and `pnpm install --frozen-lockfile`. It executes `scripts/tur018-frozen-ci-gate.mjs`, `scripts/tur021-release-hold.mjs`, `scripts/tur010-dependency-gate.mjs`. Preserve TUR002 AGPL/LGPL/libvips review and block publication until rights and licensing are independently approved. Existing Chromium/mobile/desktop and local vinext/workerd workflows are not modified. The existence of a passing script does not itself constitute an external legal opinion.

## Release hold
TOPWHIZ/TOPWIZ trademark clearance, media/source licenses, operator IAM independent approval, R2/CDN final receiver-byte revocation and Issue #22 unresolved. HARD NO-GO. No main merge, no live Cloudflare/Neon/R2/Queue/CDN/cache/DNS, no real content/prices/feed or AdSense. Engineering work-package estimate 75% only, not production readiness.