# TUR145 technical report — 2026-11-13
Base exact SHA: bdff4da64e2239b973ac0231ec7c878c5ff8be54 (TUR144).
Scope: localhost Node 22 HTTP/2 delayed continuation after synthetic revocation ACK; unaffected sibling health stream.
Expected protected post-ACK TAIL: 0 bytes; pre-ACK HEAD: 4 bytes (not reversible). No actual remote receiver byte guarantee.
Local Node 22 test: 1/1 PASS before GitHub commit; GitHub Actions final HEAD requires separate verification.
No production changes. Issue #22 remains release NO-GO.
