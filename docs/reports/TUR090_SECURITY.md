# TOPWHIZ TUR090 — Security / revocation — NO-GO

Issue #22 remains OPEN. TUR018's 12 adversarial scenarios / 99,276 synthetic bytes and TUR019 cross-isolate bypass remain release-blocking evidence. TUR089's GOAWAY and receiver ACK results are not replaced.

New negative: after generation 2 is written, a new publisher child process starts with an old generation 1 snapshot and serves eight fictional HTTP/2 bytes. A restarted process is not automatically authorized just because it has a fresh PID or TCP connection. New bounded mitigation test: a process checking the authority file at request entry and held-stream tail rejects stale generation, cancels the old stream, and returns 403 if authority disappears.

Caveats: the file is a test-only authority; it is not a durable monotonic, independent IAM-backed authorization service. Read-then-write is still TOCTOU; rollback, forged generation, PID reuse, stale CDN caches, independent edge isolates, in-flight TCP buffers and remote receiver delivery are NOT solved. A failed lookup must deny, but a successful lookup is not proof that the final byte is still authorized. Production needs independently owned rights authority and fenced stream/egress semantics with explicit impossibility boundaries. No real R2/CDN last-byte revocation proof. NO-GO.
