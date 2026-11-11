# TOPWHIZ TUR087 — Technical Report (2026-11-11)

## Lineage and verification
Stacked directly on TUR086 Draft PR #92 HEAD `003e992f996c472723036e80530fea1d367309b6`. First-page PR-triggered GitHub Actions at that SHA: 20/20 SUCCESS, including TUR086 dedicated run 42999730849. TUR087 was absent from open PRs and branch search before creation. This is not a production clearance.

## Distinct adversarial contribution
TUR086 proved that merely acknowledging revocation in two publishers leaves preexisting streams able to emit post-ACK bytes. TUR087 contrasts a **local close-before-ACK mitigation model** with a **paused receiver reading bytes already written before ACK**. Two physical Node.js child-process publishers on 127.0.0.1, separate PIDs, explicit IPC barriers, HTTP fetch readers and a paused Node HTTP response; no production code changes.

1. Close-before-ACK: both publishers send initial fictional `ABCD`, revoke generation 1→2, destroy held responses and await their local close events before acknowledging; post-ACK release finds 0 held responses in each process; new GETs return 403; no `EFGH` application tail is received. This establishes only a local process-level test invariant.
2. Already-written receiver bytes: the server completes an eight-byte fictional `ABCDWXYZ` response *before* revocation. The client deliberately pauses reading; after the generation-2 ACK it resumes and reads all eight bytes. This is **not** proof that the server emitted new bytes after ACK. It shows that client read time is not a trustworthy network delivery timestamp.

Local Node.js 22.16.0: `node --test tests/tur087-revocation-close-vs-receiver-read.test.mjs` => 2/2 PASS. GitHub Actions final report-commit checks require separate confirmation.

## Scope limitations
No claim of final-byte revocation guarantee: bytes already in kernel buffers, network, CDN caches or client storage cannot be recalled by a local response.destroy(). Neither independent R2/CDN behavior nor production stream handlers were exercised. Issue #22 remains OPEN / NO-GO. No live infrastructure was touched.

## Retained release gates
TUR018: 12 synthetic cases and 99,276 fictional post-withdrawal bytes; TUR019 cross-isolate bypass. PostgreSQL16 independent IAM/schema-owner/SECURITY DEFINER/CREATE ACL; canonical immutable original outbox SHA and route allowlist; parallel Queue/DLQ/broker ambiguous COMMIT and lease; vinext/workerd stale cache; local Chromium a11y/SEO/perf; TUR002 frozen pnpm; AGPL/LGPL libvips and upstream licenses; media rights, TOPWHIZ/TOPWIZ trademark and independent operator IAM. These are not superseded by TUR087's toy test.

No main merge, Cloudflare Preview/deploy/Queue/R2/CDN/cache purge, Neon/prod DB, DNS, real content/images/prices/merchant feed or AdSense. **Release NO-GO.**
