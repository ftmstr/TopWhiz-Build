# TUR086 Security / Revocation Fence — NO-GO

Issue #22 stays OPEN. TUR086 extends TUR083/085: **even with revocation generation 2 acknowledged by BOTH independent publisher processes**, an existing HTTP response captured at generation 1 can still emit 4 fictional bytes after ACK, or 8 fictional bytes across two concurrent streams. New requests are rejected with 403, yet this does not revoke old stream handles. A local IPC acknowledgement is not a durable, authenticated receiver ACK, nor an in-flight cancellation/last-byte barrier. `Cache-Control: no-store` is not an authorization fence or proof of global CDN invalidation.

Preserve negative evidence verbatim: TUR018 12 synthetic scenarios / **99,276 fictional PNG bytes** after withdrawal; TUR019 cross-isolate bypass. Tests intentionally use an unsafe toy server and loopback sockets; no real Cloudflare/R2/CDN/customer exposure is asserted.

Before Issue #22 could be closed, independent reviewers must establish a realistic distributed generation fence through authorization and **all in-flight byte delivery**, account for queued kernel/network bytes and already-held remote copies, verify CDN cache invalidation, and decide if strict zero-post-withdrawal-byte semantics are physically feasible. A process-level ACK or client-controlled receipt cannot substitute. Keep fail-closed NO-GO.

No new production security behavior, IAM privileges, database schema, or operational deployment. PostgreSQL SECURITY DEFINER/schema-owner/CREATE ACL separation and independently controlled operator IAM remain release gates.
