# TUR061 QUEUE RECOVERY — 2026-11-10

Original outbox canonical SHA and route allowlist are unchanged; broker/Queue/DLQ lease and ambiguous COMMIT recovery not revalidated in this tur. Local ACK and queued transport bytes do not establish durable remote receipt. Preserve prior TUR030 unknown COMMIT and parallel broker evidence; fail closed.

Acceptance: new workflow final HEAD requires independent GitHub Actions verification; until then PENDING. No main merge or live services.
