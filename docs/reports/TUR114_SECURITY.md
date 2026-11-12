# TOPWHIZ TUR114 — Security and physical cancellation provenance (NO-GO)

A genuine HTTP/2 client RST_STREAM on request A is not an authenticated cancellation grant for a different pooled SQL request B. The intentionally unsafe same-login test administrator calls pg_cancel_backend on A's stale cached PID after the pg.Pool(max=1) slot has been leased to B. If cancellation reaches B, expected SQLSTATE is 57014. The guarded *model* checks request lease identity and refuses the stale callback; it does not implement production IAM, shared durable epochs, or trusted independent cancellation credentials.

Real PG16 backend PID and backend_start equality across A/B must be observed, not assumed. HTTP2 stream reset is physically exercised, but true Next.js/workerd Request.signal and OS-level PID recycling remain NOT_RUN. Never ship the deliberately unsafe same-login cancel callback. Preserve TUR107 restricted pg_stat_activity fail-closed visibility, TUR110/113 SECURITY DEFINER CREATE/DEFAULT ACL and owner boundaries; no pg_signal_backend/superuser grant to service roles.

Issue #22 remains OPEN / RELEASE NO-GO. TUR018 12 scenarios / 99,276 fictional bytes, TUR019 cross-isolate bypass, TUR099–113 revocation/ACL negative results are retained. No proof of receiver ACK or last CDN byte, no independent IAM, no release.
