# TOPWHIZ TUR018 — Technical acceptance report
Date: 2026-11-09. Public repository: ftmstr/TopWhiz-Build.
Branch: feat/tur018-canonical-route-frozen-qa-20261109.
Parent: TUR017 Draft PR #20 exact SHA 9c8a97e4fa1875e16b1331cc70e82327326917d9.
Target: stacked Draft PR #21, not main.

## Verified starting point
TUR017 PR #20 OPEN/DRAFT/unmerged. Its 16/16 exact-head
GitHub Actions runs finished SUCCESS. All four TUR017 reports were
directly inspected. main remained at
71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6.

## TUR018 changes
1. Historical TUR002 installer --no-frozen-lockfile replaced with
   --frozen-lockfile. pnpm-lock.yaml, package versions, native Sharp
   and project AGPL license are unchanged. Added scripted frozen gate.
2. CI-only PostgreSQL migration 0017 refines the TUR017 canonical
   original outbox SHA function: reject invalid JSON types, URLs,
   path traversal encodings, malformed slugs, overlong strings and
   route arrays larger than 10. Preserve original valid SHA bytes.
   Trusted schema owner, PUBLIC/named-role CREATE preflight and
   pg_catalog/trusted schema/pg_temp search_path remain pinned.
   Preexisting invalid original-event approval cannot be consumed.
3. New real disposable PG16 test checks four good canonical arrays,
   11 adversarial arrays, JS/SQL SHA equality, malicious old
   authorization, ACL drift, no audit or receipt reset on failure
   and least-privileged function access. TUR017 parallel broker,
   Queue/DLQ, lease and TUR015 uncertain-COMMIT tests remain enabled.
4. New original-generated PNG test is **negative evidence**:
   revocation AFTER the last verified rights lookup and BEFORE
   HTTP bytes may still allow bytes. This is NOT remediation and
   remains a release blocker. TUR017 before-last-lookup R2 denial
   regression remains intact.
5. New local-only vinext/workerd 120 conditional cache requests
   and new real Chromium viewport/SEO/404/keyboard/axe tests.
   Navigation timing is a CI smoke bound, NOT Core Web Vitals.
6. Four new TUR018 CI jobs include synthetic real-PG integration,
   Node, local Cloudflare Vite/workerd, Chromium, frozen supplier
   inventory, high/critical advisory and LGPL/AGPL NO-GO.

## Debugged test fixture
First code-head test had a shared mutable revision captured after
await during concurrent synthetic event seeding. SHA equality failed
correctly; commit 505584dc21e9afe714694f1fa93e19a177cb33d9
captures revision before yielding. No security guard was weakened.

## Final evidence
Technical reports are committed separately from code. The exact
FINAL REPORT HEAD requires fresh GitHub CI verification and a PR #21
comment with complete successful run URLs and outstanding risks.
Earlier code-head success does not substitute for exact final-head CI.

## Release gate
No main merge, live Cloudflare Preview/deploy/Queues/DLQ/R2/CDN,
global cache purge, Neon/production migrations, domain, source/photo
licenses, real phones/news/prices, merchant data or AdSense.
