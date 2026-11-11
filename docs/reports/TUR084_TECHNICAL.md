# TUR084 Technical — 2026-11-11

Base: TUR083 final HEAD `b68303987436cbfc6b75bf5af51415e89a94af50`; Draft PR #89 OPEN/DRAFT; 20 accessible PR-triggered GitHub Actions runs SUCCESS. Search found no TUR084 PR or branch before creation.

Distinct from TUR082 concurrent open byte-range streams and TUR083 cross-process stale publisher generation, TUR084 examines **conditional HTTP validators** across a rights-generation change. Two physical loopback HTTP tests use only synthetic bytes: (1) initial GET 200 caches eight bytes, generation 1->2 revocation, then unsafe `If-None-Match` returns 304 with no body while the client still holds eight previously received bytes; (2) initial GET 200, revocation, then `If-Range` and `Range: bytes=4-7` return a physical HTTP 206 with four post-revocation bytes despite `Cache-Control: no-store`. ETag here represents content identity only, not a rights-generation authorization fence. This is a deliberately unsafe counterexample, not an implementation of secure media delivery.

Local Node.js v22.16.0: **2/2 PASS, 0 FAIL**, real loopback server and socket cleanup; no Cloudflare or browser cache was tested. GitHub Actions acceptance must be checked for the final report commit; local success is not CI acceptance.

Changed only tests, CI workflow and four reports. No production code, new dependency, R2, CDN, Queue, Neon, DNS, real content, or publication. Estimated engineering work-package completion: **75%**, explicitly not production readiness.
