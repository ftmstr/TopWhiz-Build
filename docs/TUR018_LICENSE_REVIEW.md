# TOPWHIZ TUR018 — Frozen dependency and license review HOLD
Date 2026-11-09. Inventory only, not publication clearance.

Historical TUR002 CI previously used --no-frozen-lockfile. It
now uses --frozen-lockfile with pnpm 10.18.3 and the unchanged
pnpm-lock.yaml v9. All four TUR018 jobs require frozen installs.
The TUR005 historic lockfile generator remains restricted to its
original feature branch; not a normal TUR018 installation path.
No package.json, lockfile, dependency, image-processing package
or source license was changed.

Inherited dependency chain: Next 16.4.5 -> optional Sharp 0.35.5
-> @img/sharp-libvips-* 1.3.4 (LGPL-3.0-or-later native packages).
AGPL-3.0 network/distribution terms, native build/redistribution,
source, linking/relinking and third-party notices need qualified
legal review. CI passing pnpm licenses list does not equal approval.
High/critical production advisory audit stays active.

Real source/photo rights, trademark TOPWHIZ/TOPWIZ, merchant
feeds/prices, advertising/privacy consents, production credentials,
main branch protection and actual operator IAM remain unresolved.
Release approved=false, releaseBlocked=true; no real deploy,
content, images, AdSense or production database migrations.
