# TUR067 — security report
RELEASE NO-GO: Issue #22 stays open. Revocation after final lookup can race enqueue/flush. A remote ACK, if present, does not retroactively authorize bytes. Even per-chunk fences cannot retract already queued bytes.
Retain PostgreSQL SECURITY DEFINER, schema-owner and CREATE ACL threat boundaries; independent operator IAM approval required. Preserve TUR018 99,276 fictional bytes across 12 cases, TUR019 cross-isolate bypass, and all earlier negative tests.
No Cloudflare R2, CDN, cache purge, deploy or real media used. No zero-byte leakage guarantee established.
