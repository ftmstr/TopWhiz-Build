# TOPWHIZ TUR093 — HTTP/2 generation rollback and untrusted floor ABA (2026-11-11)

Base: Public ftmstr/TopWhiz-Build TUR092 exact HEAD `8036b58ae3e17fa4a19e40d13d28a07215ed4af4`; previous 19/19 observable PR-triggered workflow runs SUCCESS after re-running a cancelled Chromium job. This is a separate stacked Draft PR; no main merge.

New local loopback Node.js HTTP/2 regression with three tests: (1) after generation 1→2 revocation, atomic replacement of mutable generation file with 1 reauthorizes an unsafe publisher and returns eight fictional bytes; (2) an illustrative high-water file retaining 2 denies an already-open stream's EFGH tail, subsequent request and missing floor; (3) if the attacker can also roll back the purported high-water file to 1, even the illustrative fence reauthorizes eight fictional bytes. Test is negative evidence; a local file is not an independent monotonic authority. No production code, dependency or schema changes.

Node.js 22.16.0: initial 3/3 PASS; ten independent reruns 30/30 PASS. Dedicated CI independently re-runs exact test and inherited immutable-outbox/Queue/frozen licensing controls. Real Cloudflare R2/CDN last-byte zero-leak, IAM, signed authority, physical delivery, remote ACK and global cache invalidation remain NOT PROVEN. No production-readiness claim.

Estimated engineering work-package progress 75% only; issue #22 OPEN and release NO-GO. Final-HEAD CI must be independently verified including pending/failure/NOT_RUN.
