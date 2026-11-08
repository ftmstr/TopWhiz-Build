# TOPWHIZ TUR014 — Dependency and licensing provenance
Date: 2026-11-08; unapproved release review.

Frozen workspace dependencies, pnpm-lock.yaml and Node/Next/vinext/
Wrangler/Cloudflare Vite pins are unchanged in TUR014.

## Verified chain from TUR013 and inherited TUR014 CI
apps/web package -> Next.js 16.4.5 (direct)
Next.js optionalDependencies -> sharp 0.35.5
sharp optional native dependencies -> @img/sharp-libvips-* 1.3.4.
In installed Linux/x64 CI packages, the independent license inventory
reports LGPL-3.0-or-later for:
- @img/sharp-libvips-linux-x64@1.3.4
- @img/sharp-libvips-linuxmusl-x64@1.3.4

216 dependency entries, 11 license categories in automated inventory.
Explicit output remains approved:false,releaseBlocked:true,
legalReviewRequired:true. The production high/critical audit
threshold is a separate vulnerability security gate, not legal
clearance. Local workerd bundle-name scan that does not include
native libvips is not proof about build images or other distribution
artifacts.

## Options, NOT approval
1. Keep frozen Next native Sharp path. Qualified counsel reviews
   binary linking/relinking, notices, corresponding source,
   distribution/build container and AGPL-3.0 interaction.
2. Independently review Cloudflare Images/Transformations binding
   in a future approved Access-protected staging account. It may
   avoid shipping native libvips in workerd but entails pricing,
   quotas, privacy, upstream image rights and transformations.
3. Serve rights-reviewed original content-addressed images via R2.
   Could avoid resizing but creates LCP/bandwidth/EXIF/ICC/
   responsive sizes and content-derivative rights risks.
4. Reviewed build-time derivative image pipeline may require
   libvips during builds and thus separate notice/distribution
   analysis. Removing optional dependencies blindly can break
   Next image pipeline.

No copyright infringement or clean legal status asserted.
No actual licensed external media, Google AdSense or public domain
approved. TOPWHIZ/TOPWIZ trademark overlap, AGPL-3.0 obligations,
third-party source/data/image licenses and LGPL-3.0-or-later
review ALL remain open mandatory release blockers.
