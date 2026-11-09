# TOPWHIZ TUR041 — real Next.js HTTP acceptance / 2026-11-09

## Source of truth
Stack directly on canonical TUR040 Draft PR #45 exact HEAD `aa9a3a6c268d07abb7c5986074f2c0c073a60127`, independently verified **20/20 GitHub Actions workflows completed SUCCESS**. TUR041 did not previously exist when branch was created. No production runtime, migrations, lockfile or dependencies changed.

## New execution mode
TUR034 imported the Next App Router GET into a Node bridge; TUR035-040 tested mocked stream behaviour through the actual GET function. This turn starts a **real production `next start` HTTP server bound 127.0.0.1:3131** following a true Next production build, and issues two parallel HTTP requests through the original Next App Router route `/media/cms/[id]`. A strictly CI-only `--import` preload intercepts the sole fictional `https://cms.ci.invalid/v1/media/tur041-[ab]` origin and invokes the original CMS `handleCmsMedia`, with its full image validation and a repository-generated original PNG plus in-memory R2-compatible substitute.

A disposable PostgreSQL16 instance supplies two distinct password-authenticated LOGIN identities for the CMS reader and rights revoker. Each request is held **after the second actual SQL SELECT returned approved rights**, using a separate table gate; the revoker atomically commits rights withdrawal, generation increment and gate releases. The old HTTP requests may complete with 200 and all fictional PNG bytes after COMMIT, while fresh requests return 404. This is a reproducible **NEGATIVE security regression**, not a revocation mechanism.

This tests the actual Next.js HTTP listener and handler, unlike importing only the GET function. It is **not** real Cloudflare Worker/vinext/R2/CDN, not a production Neon security-barrier view, not global cache invalidation, and not receipt of the last network byte. The test does not establish reliable recipient ACK or independent owner IAM safeguards.

## QA and scope
The CI workflow runs frozen pnpm, original PG16 SSR seed, Next production build, real loopback HTTP, inherited PG16/Queue/Node tests and publisher/license holds. Exact final-HEAD GitHub Actions must independently complete SUCCESS before release of this report. No main merge, domains or external media.

Engineering work-package estimate **65/100** (architecture 14/15; UI 12/20; backend 20/25; security evidence 10/20; CI 9/10; live/legal 0/10). These are subjective planning points, not test success or percentage of production readiness.
