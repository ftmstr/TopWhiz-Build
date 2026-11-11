# TUR085 Technical — 2026-11-11

Base: TUR084 final HEAD `5dced59b859129b0eca430db8884a1ebb5443874`, Draft PR #90 OPEN/DRAFT. Its first-page 20 PR-triggered GitHub Actions runs were SUCCESS (including dedicated TUR084 run 42984294802). No TUR085 branch/PR found before creation.

Distinct from TUR084's single-process conditional validators and TUR083's nonconditional multi-process generation gap, TUR085 starts **two physically separate Node.js processes** with distinct PIDs, independent HTTP listeners and isolated in-memory rights generations. Both initially serve eight fictional bytes and the same content ETag. After an IPC revocation ACK from publisher A (generation 1 to 2), A denies conditional requests (HTTP 403). Publisher B, deliberately NOT notified, returns a stale 304 to If-None-Match (zero new bytes, eight bytes already client-held) and a stale HTTP 206 to If-Range (four NEW fictional bytes after A's revocation). This is negative evidence of missing global propagation, not a production fix or proof of Cloudflare behavior.

Local Node.js 22.16.0: `node --test tests/tur085-cross-process-conditional-revocation-negative.test.mjs` => **2/2 PASS, 0 FAIL**, physical 127.0.0.1 HTTP sockets and independent child processes; no external traffic. No real Cloudflare R2/CDN/Queue, PostgreSQL, vinext/workerd or Chromium run locally in this turn (NOT_RUN). GitHub Actions acceptance requires separate verification of the **last report commit**.

Changes: test, dedicated CI workflow and four reports only; no production code, dependency, lockfile, media or merchant data. Estimated engineering work-package progress **75%**, not production readiness. Main merge and any live deployment prohibited. Issue #22 remains OPEN/NO-GO.
