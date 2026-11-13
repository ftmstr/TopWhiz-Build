# TUR137 Technical — 2026-11-13
Parent TUR136 exact HEAD: `490cb8fbe7066bdf2349174822eaa5b6e5a8049d`.
Unique local Node22 HTTP/2 test: asynchronous media continuation retains generation=1 while a synthetic revocation ACK increments generation=2. Unsafe continuation writes four TAIL bytes; guarded continuation checks generation and suppresses stale write. A sibling HTTP/2 request must complete.
This is a synthetic localhost adversarial regression, NOT a production R2/CDN fix or last physical receiver-byte proof.
Final SHA CI: PENDING until actual GitHub runs are inspected.
