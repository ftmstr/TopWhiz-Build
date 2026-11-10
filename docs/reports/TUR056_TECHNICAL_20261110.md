# TOPWHIZ TUR056 — Technical — 2026-11-10

## Chain and uniqueness
The Public TUR053 Draft PR #58 HEAD `530f43911c3d822b4c9360c1c223bbf0ca15bcdb` was independently verified 20/20 GitHub Actions SUCCESS. The hourly automation already created TUR054 and TUR055, so neither is repeated. Canonical TUR055 Draft PR #60 exact SHA `76829e8b64225664c7501efad7335b0e87a19c84` has **19/19** visible exact-HEAD GitHub Actions SUCCESS (not falsely described as 20/20). TUR056 is stacked directly on TUR055 with its own test, workflow and four reports.

## Distinct new concrete evidence
The new test launches the **actual Next.js production HTTP server** using `next start` and requests the real Next media App Router route, which calls the original `handleCmsMedia` via the existing strict CI-only TUR041 intercepted fictional `cms.ci.invalid` fetch. A disposable PostgreSQL 16 schema holds exactly original valid synthetic PNG metadata, independently SHA-validated by the actual CMS handler. The schema has **three independently password-authenticated LOGIN actors** with no superuser/CREATEDB/CREATEROLE privileges: reader, rights revoker, and actual media-table owner.

A real PostgreSQL trigger rejects unauthorized `approved=false -> true` mutations. The reader lacks mutation rights. The revoker can independently COMMIT `approved=false,generation=2`, and neither revoker nor owner can reapprove while the trigger remains enabled. The revoker cannot ALTER TABLE. Nevertheless the independently authenticated **table owner (non-superuser)** disables its own trigger, commits `approved=true,generation=3`, and the real Next HTTP media endpoint again serves synthetic bytes without application review/outbox approval. This is an intentionally NEGATIVE owner/IAM bypass demonstration.

## Strict limitations
The PG16 `media` table and trigger are isolated threat-model fixtures, **not the production security-barrier SQL view**, rights issuer, canonical outbox or externally separated IAM. This does not claim the actual production Neon view will re-publish solely via table manipulation; the experiment proves table ownership cannot be constrained by an app-only trigger. Real Cloudflare R2/CDN/purge/receiver last-byte NOT_RUN; no production source modifications or deploy. Inherited TUR030 covers unknown COMMIT readback, TUR053 server client abort; this specific mutation receives confirmed PG COMMIT ACK.

## Acceptance & progress
New real Next+PG16 test and inherited original outbox SHA, Queue/DLQ, workerd, Chromium, pnpm-frozen, AGPL/LGPL gates must be verified at the **exact final SHA**. Subjective weighted engineering progress **67/100**: architecture 14/15, UI 12/20, backend 21/25, security evidence 11/20, CI 9/10, publication/legal 0/10. This is NOT production readiness. Issue #22 stays OPEN; release NO-GO.
