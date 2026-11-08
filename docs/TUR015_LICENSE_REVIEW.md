# TOPWHIZ TUR015 — Frozen dependency / LGPL 3 licensing review
Date 2026-11-08. Inventory ONLY, NOT approval to distribute.
No package.json or pnpm-lock.yaml version upgrade in this turn.

## Confirmed local dependency chain
Direct apps/web Next.js 16.4.5
→ Next.js optionalDependencies sharp 0.35.5
→ sharp optional native @img/sharp-libvips-* 1.3.4.

The Linux/x64 pnpm installed-package CI licence inventory finds:
- @img/sharp-libvips-linux-x64@1.3.4 : LGPL-3.0-or-later
- @img/sharp-libvips-linuxmusl-x64@1.3.4 : LGPL-3.0-or-later.

CI checks 216 installed dependency records in 11 license
categories. The license gate expressly returns approved:false,
releaseBlocked:true, legalReviewRequired:true. The separate
high/critical production vulnerability audit passes, but does
not satisfy legal licences or trademark clearance.

The upstream sharp-libvips project differentiates between
its Apache-2.0-licensed PACKAGING scripts and a native prebuilt
tarball containing libraries licensed under various separate
terms. Upstream third-party notices list libvips, glib,
libheif, libexif, pango, librsvg and others under LGPLv3.
This exact distinction matters in counsel review. An absence
of native .node/libvips filename in the LOCAL workerd output
does not prove there are no obligations for build containers,
tooling, runtime, linking, shared libraries or redistribution.

Primary sources:
https://github.com/lovell/sharp-libvips
https://github.com/lovell/sharp-libvips/blob/main/THIRD-PARTY-NOTICES.md
https://github.com/lovell/sharp-libvips/releases/tag/v1.3.4

## Options requiring separate evidence and approval
A. Keep frozen Next native Sharp/libvips image optimization.
   Counsel must review exact distribution, linking/relinking,
   notices, corresponding source access, Docker/build artifacts,
   other native dependencies and AGPL-3.0 interaction.
B. Independently evaluate Cloudflare Images/Transformations
   binding only in a later approved Access-protected environment:
   image licence/derivatives, privacy, quotas and costs still apply.
C. Deliver independently licensed, content-addressed R2 original
   images without native optimizer; must test mobile bandwidth/LCP,
   orientation/EXIF/ICC, resizing requirements and AV scanning.
   No R2 bucket or real external photo is connected.
D. Build-time generated licensed derivatives may still involve
   libvips in build artifacts and require separate source/notice
   analysis. Do not quietly drop optional dependencies to
   manufacture a pass.

No claim of legal violation or clean commercial clearance
is made. Human qualified licensing counsel approval, AGPL-3.0
rights, TOPWHIZ/TOPWIZ trademark, publisher/source licences
and actual imagery rights remain hard NO-GO gates before release.
All real ads, phone/news/merchant data and domain remain inactive.
