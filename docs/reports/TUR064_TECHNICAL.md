# TUR064 technical — 2026-11-10

Base TUR063 SHA 586407f7302013eba02d7db8492bb16f817b48e2, Draft PR #68. Five deterministic Node 22 test-only counterexamples: stale guardian edge, fresh guardian deny, missing/permission-denied guardian fail-closed, queued byte irrevocability, and absent remote final-byte ACK. No production runtime change, no actual distributed cache, R2 or receiver acceptance. CI final SHA must be independently verified. Work-package coverage estimate 71/100, NOT production readiness.

---

## Additional independent CMS/PG16 HTTP integration evidence

# TUR064 — real CMS media contract and post-final-check HTTP delivery gap
Date: 2026-11-10. Direct stacked parent TUR063 Draft PR #68, original HEAD `586407f7302013eba02d7db8492bb16f817b48e2`, previously verified **20/20 SUCCESS**. Do not duplicate prior work.

## New contract feasibility
New `src/cms/guardian-approval-contract.mjs` is a reusable **opt-in, not live-wired** `findApprovedAsset` contract for the actual `handleCmsMedia` CMS HTTP handler. Every request gets a fresh closure. Both the media selection and independently authenticated guardian account must attest true approval and the **same canonical positive bigint generation**, and the final re-query must match the first pinned generation. Missing identity, missing or ambiguous generation, absent guardian, mismatch and denied rights fail closed. SQL/ACL connection errors propagate through the original CMS handler as 503. The existing production `publicMediaAssetSql` selects id/key/contentType/bytes/sha256Hex/rightsApproved **without a generation** and current `index.ts` does not have any guardian credential/binding: integration as-is is **impossible without controlled schema/API/IAM change**. No change to production route/Worker was made, so prior positive TUR063 checks remain strictly test-only.

## Real integration testing
New disposable PostgreSQL16 with five independent password LOGIN non-superusers and two independently owned tables. The actual unmodified `handleCmsMedia` does original SHA-256, PNG signature and two reads, served to a **real Node HTTP loopback socket** using original fictional PNG. The test checks baseline, missing guardian, epoch mismatch, independent SELECT privilege removal 503 zero bytes, owner/guardian privilege separation, SECURITY DEFINER with pinned search_path, CREATE ACL revocation and owner bypass. It does NOT claim the Next production proxy is live-integrated: inherited TUR063 real `next start` tests run independently in this CI.

## Distinct adversarial contribution
After the actual CMS handler completes its final dual-account SQL check and constructs a 200 Response, the test deliberately pauses **before writing real HTTP headers and bytes**. A separate guardian-owned SQL session commits rights withdrawal; a new request receives 404/zero bytes. Then the older pending response is released to its HTTP client and still delivers a fully SHA-verified fictional PNG with HTTP200. This explicitly demonstrates that even a dual-guardian/per-request generation pin **does not prevent delivery of already admitted bytes after revoke COMMIT**. No browser/edge/last ACK claim is made.

## Remaining hard dependencies
Design/implement independently administered guardian IAM, schema migration that exposes trustworthy generation without media-owner spoof, verified policy/rollback/recovery, distributed serving/cancellation/edge purge, globally safe caches, true receiver-level completion semantics and external security review. Do not promote test-only adapters into live service as proof of safety.

## Progress bookkeeping
Prior development work-package coverage 70/100 (architecture 14/15, UI 12/20, services 21/25, security-evidence 14/20, CI 9/10, legal/launch 0/10). Conditional on exact-final-HEAD all CI PASS, new evidence raises security-evidence to **15/20**: overall **71/100** (estimate, NOT production readiness). Issue #22 OPEN; RELEASE NO-GO.
