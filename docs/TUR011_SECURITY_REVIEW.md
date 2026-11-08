# TOPWHIZ TUR011 — Security, supply chain and compliance review
Date: 2026-11-08. No production environment authorized.

## Verified technical controls
- Pinned and frozen Cloudflare Vite plugin 1.67.0, Wrangler 4.158.0,
  Vite 8.3.6, React/RSC 19.3.1 and vinext 1.4.4.
- Isolated local workerd with real vinext App Router HTML, no
  remoteBindings, account IDs, production secrets, real DB/R2/Queue.
  This is not a hardened sandbox; only trusted CI code is executed.
- Source/media rights and issuer active/key/signed evidence checked by
  PostgreSQL security-barrier views; revocation requires durable outbox.
  Real worldwide CDN cache invalidation still NOT_RUN.
- Eight concurrent source rights revokers, six concurrent issuer
  revokers, thirty-two Queue competing receipts and 32 R2-like media
  reads validate bounded fail-closed synthetic transaction behavior.
  These numbers are not a production performance benchmark.
- Chromium 320/360/390/768/1440/1920 widths, actual decoded synthetic
  PNG, keyboard skip/landmarks, noindex, three inactive ad locations,
  and axe serious/critical WCAG A/AA checks. Not full WCAG certification.
- pnpm audit --prod --audit-level high must succeed; pnpm licenses
  list --json inventoried by automated policy. No package scripts
  executed in the one-time lockfile workflow.

## OPEN human license review — NOT an automatic pass
The inventory reported LGPL-3.0-or-later transitive libvips
binaries used by sharp:
- @img/sharp-libvips-linux-x64@1.3.4
- @img/sharp-libvips-linuxmusl-x64@1.3.4

LGPL may permit distributions with obligations and is not inherently
incompatible with AGPL. The code deliberately records both items as
releaseBlocked=true and legalReviewRequired=true. Determine actual
binary linking and distribution context, required notices/source
and user-relinking conditions with human license counsel BEFORE
any public release. The scan's success only means the exception
is identified and tracked, NOT licensed/approved.

## Mandatory no-go
No Cloudflare credentials, live zone, live Preview, main merge,
real device photos/specifications/news/prices, active Google
AdSense code or real automatic publishing. Trademark TOPWHIZ/TOPWIZ,
source rights, AGPL and potential LGPL obligations need approval.
Offline tests are not protection against malicious packages, DDoS
or unexpected production behavior. Protect main before release.
