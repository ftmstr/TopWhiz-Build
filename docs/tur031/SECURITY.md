# TUR031 security / independent assurance — RELEASE NO-GO

Evidence classifications:
- REAL: disposable PostgreSQL 16 transactions, two distinct password LOGIN sessions, local TCP HTTP server/client, complete fictional response payloads and committed rights state.
- NEGATIVE: an authorized read made before revocation is not automatically revoked by a later PostgreSQL COMMIT; after revocation, a paused consumer may still consume already-sent bytes.
- NOT PROVEN: byte arrival time at NIC or remote consumer, stronger global last-byte guarantee, CDN purge across geography, live Cloudflare R2, end-to-end production handler, actual revocation of buffered data, network/receiver ACK.
- NOT IMPLEMENTED: independently approved IAM separation, owner/superuser tamper protection, migration-actor independent audit, external security review and production takedown mechanism.

Issue #22 remains OPEN. Never convert the negative TUR018 12/12 interleavings and **99,276 fictional post-withdrawal bytes** into a PASS; TUR019 cross-isolate bypass remains inherited. TUR021/TUR029/TUR030 proved that schema owner/superuser can bypass SECURITY DEFINER, privileges and CAS by rewriting rights/generation out-of-band. The new test does not fix this and does not connect the real CMS media production code to the transport experiment. A strong zero-last-byte property requires a separately specified linearization/receiver protocol and independent acceptance, if feasible at all; ordinary DB transactions and HTTP cache directives are insufficient.

This is a safe isolated negative regression only: no real customer image, no actual rights incident, no live R2/CDN/network release. Maintain RELEASE NO-GO and avoid misleading production security claims.
