# TOPWHIZ TUR060 — real Next HTTP and independent PG16 SECURITY DEFINER / CREATE ACL — 2026-11-10

## Proven starting point
Canonical TUR056 Draft PR #61 HEAD `d9034b5466c2a343b0a28b2fb928cb1705a6a8fa` verified 20/20 GitHub Actions SUCCESS. Hourly automation had already opened TUR057–TUR059, which were not duplicated. TUR059 Draft PR #64 canonical HEAD `def2e51d20170ff1afb4fa550f187ef9ffb50fa9` verified **20/20 exact-HEAD SUCCESS**. TUR060 is stacked directly on TUR059.

## New actual boundary
This distinct new test exercises the **genuine Next.js production `next start` loopback HTTP** media route and original CMS `handleCmsMedia` using the existing strict CI-only `cms.ci.invalid` preload, a repository-generated structurally valid SHA-256 checked fictional PNG and in-memory R2 substitute. A disposable **real PostgreSQL 16** schema provides four independently password-authenticated non-superuser LOGIN roles: media reader, rights revoker, table owner and unauthorized outsider.

The independent revoker commits `approved=false,generation=2` and a new Next HTTP GET returns 404. The outsider lacks table UPDATE and cannot CREATE objects, and initially cannot EXECUTE the owner's new function. However the table owner temporarily has schema CREATE, creates an explicitly pinned-search-path **SECURITY DEFINER** reapproval function, removes default PUBLIC EXECUTE, grants EXECUTE to the outsider, then loses schema CREATE through administrative REVOKE. This REVOKE prevents further new owner objects but **does not delete or revoke EXECUTE on the already-created function**. The otherwise unauthorized outsider invokes that function under the table owner's effective SQL rights, restoring `approved=true,generation=3`. A fresh actual Next HTTP GET then returns the original fictional PNG. This demonstrates a persistent elevated function/ACL boundary even when later CREATE permission is removed.

The full production Neon CMS security-barrier view, outbox publication/issuer gates and operator IAM segmentation were NOT_RUN. There is no demonstrated unauthorized re-publication in real production, no Cloudflare CDN/R2/Queue/purge/last-byte receiver ACK, and no new production mitigation. This is intentionally a **negative** adversarial proof on a disposable rights surrogate.

## Gates / progress
CI must validate exact final HEAD with frozen pnpm, PG16, Next production build, original TUR056 owner test, TUR053 disconnect, TUR030 unknown COMMIT, original outbox SHA/Queue/DLQ, inherited workerd/Chromium and AGPL/LGPL. No production app code, runtime dependencies, migrations or lockfile altered.

Subjective **engineering package progress 68/100**: architecture 14/15, UI 12/20, backend 21/25, security evidence 12/20, CI 9/10, public release/legal 0/10. This is not production readiness or a release authorization. Issue #22 OPEN, release NO-GO.
