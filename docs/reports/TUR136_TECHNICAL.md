# TUR136 Technical — 2026-11-13

Scope: one new Node22 real localhost HTTP/2 two-stream regression. A media stream is paused after HEAD, a sibling stream is opened on the same session, a synthetic revocation ACK is issued, and the delayed media continuation is released. Unsafe case delivers HEADTAIL (4 stale bytes); guarded case delivers HEAD (0 stale bytes) while sibling returns SIBLING_OK. No production code changed. CI must determine actual PASS; this document is not CI evidence. Parent: TUR135 c759047c6f977fe4b2f744bf142df0bb115ef336.
