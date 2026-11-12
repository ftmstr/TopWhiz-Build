# TOPWHIZ TUR118 — Revocation COMMIT, Queue/DLQ and original immutable outbox SHA

The new test exercises `BEGIN; REVOKE executor_group FROM broker; COMMIT` with an already-connected broker and external PG16 privilege checks. This is only a **locally acknowledged COMMIT**, not a lost-COMMIT-ACK adversarial proof and not an external Queue consumer receipt. Runtime application queue, rights generation, publish outbox and R2 are not modified. A distinct guardian-owner synthetic generation-2 COMMIT plus reader readback checks local owner separation, not remote receiver ACK/CDN last byte.

Dedicated frozen CI re-executes inherited TUR030 ambiguous COMMIT transport, TUR019 SECDEF/CREATE ACL independent ownership, TUR018 original immutable outbox SHA, TUR017 Queue/DLQ lease/parallel broker and TUR112/111/109/108 genuine HTTP/2 revocation tests. This is regression verification, not new Queue logic or final-byte security. Preserve original SHA and release hold; Issue #22 OPEN / NO-GO.
