# TOPWHIZ TUR108 — security acceptance and NO-GO

Threat: a media rights revoke ACK is observed in one publisher/guardian process, while another process retains a valid old signed access token and old media cache. Test reproduces four bytes OLD! delivered after ACK across a genuine loopback HTTP/2 connection. A synthetic shared authority checked per request and again after an asynchronous fill rejects stale epoch with 403 and no response body. During authority outage, fail closed. HMAC is not independent authenticated operator IAM and the test authority is not production grade.

TUR107 SECDEF restricted pg_stat_activity visibility fail-closed and intentionally unsafe fresh lease tuple spoof remain unresolved. Never grant global pg_signal_backend, pg_read_all_stats or superuser service rights to make tests pass. SECURITY DEFINER/schema-owner/CREATE ACL and PostgreSQL COMMIT ambiguity remain independent blockers. TUR018 12-case 99,276-byte negative and TUR019 cross-isolate bypass remain valid. TUR099–106 HTTP/2 negatives are not deleted. The safe test does NOT prove that bytes already queued in HTTP/2/TCP, reverse proxies, R2 or CDN cannot be consumed after ACK.

No new production runtime, IAM, ACL, R2/CDN, Cloudflare, Queue, media or database changes. Issue #22 OPEN, RELEASE NO-GO pending independent operator IAM, final network byte proof, rights/trademark approval.
