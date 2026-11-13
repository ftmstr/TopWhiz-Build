# TUR149 Technical — 2026-11-13

Parent: TUR148 exact HEAD `598ff926be7128b4248a23adff5e6ddebf40ab33`, whose 20/20 pull-request workflows and 57/57 first-page jobs independently returned SUCCESS.

Adds one localhost Node22 HTTP/2 synthetic regression for delayed ALLOW replay after a lease nonce changes from A to B **without epoch increment**. Epoch-only authorization incorrectly writes a four-byte TAIL; epoch-plus-nonce gate rejects it and an unrelated health stream succeeds. This is a test-model counterexample, **not** a production authorization fix or proof of last receiver byte security.

No main merge, live deploy, R2/CDN/Queue, production database, real media, pricing, DNS or advertising. Engineering work-package planning estimate **75%**; not a production readiness metric. Final SHA Actions and all jobs must be independently checked after the final report commit.
