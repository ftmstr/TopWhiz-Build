# TOPWHIZ TUR013 — Complete verified local image dependency trace and options
Date: 2026-11-08. No license clearance or package removal.

## Observed frozen dependency chain
1. apps/web/package.json has a DIRECT dependency on Next.js 16.4.5.
2. pnpm-lock.yaml records sharp 0.35.5 as a Next.js OPTIONAL
   dependency (not a direct TOPWHIZ source import).
3. sharp 0.35.5 has mandatory @img/colour 1.1.0,
   detect-libc 2.1.2, semver 7.8.6 and native platform-specific
   OPTIONAL Sharp binaries/libvips 1.3.4 (x64 GNU/musl,
   ARM and other OS targets).
4. The Linux CI installed-package license inventory identified
   LGPL-3.0-or-later in @img/sharp-libvips-linux-x64@1.3.4 and
   @img/sharp-libvips-linuxmusl-x64@1.3.4.
5. The pinned build/provenance scan checks both Next->sharp and
   sharp->libvips lock edges and examines the local workerd artifact
   for file names indicating native libvips/Sharp copies.
   An absent named file in workerd is NOT a distribution rights
   finding for Node images, builds, linking or other artifacts.
6. Automated inventory: 216 installed package entries, 11 license
   categories; approved:false, legalReviewRequired:true,
   releaseBlocked:true. High/critical prod pnpm advisory gate PASS.
   No human SPDX legal sign-off and no source/notice compliance proof.

## Alternative approaches for future independent evaluation
A. Retain native Next + Sharp/libvips. Highest native image pipeline
   compatibility but must review binary redistribution, source,
   notices, linking/relinking and AGPL interaction with counsel.
B. Cloudflare Images / Workers Image Transformation binding within
   a separately approved Access-protected staging account. Could
   avoid shipping a native Worker libvips runtime, but costs, image
   licence/derivatives, quotas, data flow and vendor risk remain.
   No binding or billing account was activated.
C. Serve controlled content-addressed R2 originals in browsers.
   Avoids native resize in production, but poor mobile LCP,
   EXIF/ICC/orientation, responsive sizes and large payload risks.
D. Build-time derivatives from independently licensed originals:
   might still use native libvips during building; same notice/source
   questions could apply to distributed build images.

A clean dependency graph is not a legal conclusion. LGPL-3.0-or-later
does not inherently forbid commercial use; nor is it automatically
approved by an AGPL-3.0 application. Human counsel/qualified rights
officer must evaluate exact deployment artifacts and obligations.
No unauthorized dependency suppression, alternative activation,
real photography or production licence clearance claimed.
