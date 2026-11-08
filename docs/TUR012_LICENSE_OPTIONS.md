# TOPWHIZ TUR012 — Sharp/libvips LGPL dependency provenance and alternatives
Date 2026-11-08
Evidence: exact pnpm-lock.yaml on TUR012 branch and CI pnpm licenses list --json
Plus scripts/tur012-sharp-provenance.mjs run after local workerd build.

## Observed transitive chain (verified in lockfile)
apps/web uses Next.js 16.4.5.
Next.js dependency snapshot lists an OPTIONAL sharp 0.35.5.
sharp 0.35.5 lists OPTIONAL platform-specific libvips 1.3.4.
The license scan identifies two LGPL-3.0-or-later binary artifacts:
- @img/sharp-libvips-linux-x64@1.3.4
- @img/sharp-libvips-linuxmusl-x64@1.3.4
Their appearance in the lockfile is NOT a direct TOPWHIZ import.

Next.js may require Sharp for its native runtime image optimization
(see https://nextjs.org/docs/messages/install-sharp).
vinext offers an alternative Cloudflare-specific image optimization
path and may redirect to original image URLs if no optimizer is
configured. However the actual image source rights, memory/security,
content-size and performance tradeoffs still need independent review.
See https://vinext.dev/docs/deploying/cloudflare and
https://developers.cloudflare.com/images/optimization/binding/

## Options (NOT authorization to deploy)

1. KEEP native Next.js + optional sharp/libvips. Preserve optimized
   Next image processing, but have software counsel audit the actual
   distribution model, unmodified native binaries, notices, source
   availability and applicable LGPL/AGPL conditions.
2. Use vinext Cloudflare image optimization binding in a future
   isolated, Access-protected environment. This may avoid bundling
   native libvips into edge runtime, but requires an actual binding,
   vendor fees, licensed image source, privacy/cost review, secure
   transformation quotas, feature-parity tests and a frozen dependency
   bundle audit. NO binding was created or configured.
3. Serve pre-reviewed original images unoptimized using
   controlled content-addressed R2 bytes and browser-native img.
   This avoids the Next optimization path but may increase payload
   sizes and harm LCP/visual fidelity, especially mobile. Validate
   resizing, security, rights and asset size before any production use.
   NO production images were published or fetched.

## What was NOT concluded

- Optional dependency presence alone does not mean every artifact
  distributes that binary. A local workerd bundle file-name scan cannot
  establish the legal obligations of external node_modules, builders,
  Docker images, JavaScript bundled code, linking or notices.
- The license scanner still reports approved:false,
  releaseBlocked:true and legalReviewRequired:true. CI success only
  proves that this blocker was detected and not silently ignored.
- LGPL-3.0-or-later does not automatically prohibit use. No finding of
  license infringement, commercial clearance, AGPL compatibility or
  legal exemption is asserted. Counsel must review the intended
  exact distribution/build/deployment approach.
- Blind removal of Sharp or disabling optional dependencies could break
  the Next build and image pipeline; no unverified workaround was applied.

Next action: inventory exact production deployment artifacts, notices,
license/source distributions and rights before choosing any alternative.
