# TOPWHIZ TUR133 — GOAWAY is not a final-byte revocation fence

Threat: after media publication rights are revoked and an authority acknowledges epoch advance, a server may issue HTTP/2 GOAWAY to drain a connection. GOAWAY blocks future streams but does not retroactively cancel already-accepted streams. TUR133 physical localhost HTTP/2 test observes GOAWAY NO_ERROR and new-stream rejection, then a synthetic revocation ACK, then 4 TAIL bytes on the existing stream in an unsafe fixture. The guarded countermodel rechecks local epoch after asynchronous release and sends 0 TAIL bytes; authority outage also fails closed for TAIL. HEAD was already received before ACK and cannot be retracted.

The authority is in-process synthetic state; neither R2 nor a CDN nor a remote physical last-byte receiver is exercised. GOAWAY timing and application data event ordering are not proof of packet timing or globally consistent invalidation. No production patch, privilege escalation, broad pg_signal_backend or schema migration. Inherited independent PG16 SECURITY DEFINER/schema-owner/CREATE ACL and request/lease tests remain mandatory.

Issue #22 OPEN / release NO-GO. Independent operator IAM, rights/licensing approvals and TOPWHIZ/TOPWIZ brand review remain unresolved. TUR018 12/99,276 negative synthetic bytes and TUR019 cross-isolate bypass remain release blockers.
