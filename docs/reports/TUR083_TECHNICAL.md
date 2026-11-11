# TUR083 Technical — 2026-11-11

Base: TUR082 final HEAD `b61456b2a3bf628321091e189171f22b4a35d35e`; Draft PR #88, 20 accessible pull_request workflow runs SUCCESS. No TUR083 PR/branch existed before this turn.

Distinct from TUR082's two simultaneous ranges within one HTTP server, TUR083 forks **two independent Node.js publisher processes** with separate memory, process IDs, ephemeral loopback TCP listeners and HTTP 206 responses. Both emit four initial synthetic bytes. The coordinator delivers a generation=2 revocation to publisher A only, receives its process-local IPC acknowledgement, and releases both streams. A destroys its response; B remains generation=1 and emits four additional synthetic bytes after the revocation acknowledgement. Expected: A 4/8 truncated, B 8/8 complete, B 4 post-revocation bytes. IPC acknowledgement is not authenticated global delivery evidence. A second test explicitly rejects conflating local generations with a cross-process barrier.

Locally executed on Node.js v22.16.0: **2/2 PASS, 0 failures, 0 cancellations**; subprocesses and sockets were closed. GitHub Actions results for the final report commit must be independently checked; local PASS is not CI acceptance.

Only new tests, workflow and reports; no production code, dependencies, real media, real R2/CDN or live services. This test is deliberately an unsafe negative counterexample and must not be used as a release design. Engineering work package estimate: **75%**, not production readiness.
