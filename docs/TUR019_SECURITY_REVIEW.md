# TOPWHIZ TUR019 — R2 last-authorization-to-last-byte threat model
Date: 2026-11-09. No live Cloudflare access. Issue #22 is OPEN.

## Independent immutable negative evidence
TUR018 tests/tur018-r2-final-check-gap.test.mjs is retained
verbatim and remains a passing test that proves an UNSAFE race:
12 synthetic changes after the last DB read led to 99,276 fictional
PNG bytes supplied after rights withdrawal. This finding is an
OPEN RELEASE BLOCKER, not a remediated security PASS.

## Scoped positive prototype
The new local media publication gate serializes admission and
revocation *in one JS instance and only for clients enrolling in
that particular object*. A read permit persists through response
ReadableStream EOF or cancellation; writer waits for every read
permit before invoking a synthetic rights COMMIT callback. A
COMMIT failure/ack-loss quarantines the asset. Under these modelled
conditions, no active JS stream remains after a successful withdrawal.
An erroring/cancelled stream releases its permit once.

## Unsolved risks — production prohibited
- A Cloudflare Worker isolate, another process or any publisher
  updating rights outside this SAME fence ignores the local map.
  Cross-isolate bypass is deliberately proven by test. Neither
  database transactions nor a global exclusive lock are implemented.
- JS ReadableStream EOF means upstream app consumption, NOT
  downstream client ACK of the last HTTP/TCP byte. Buffered proxy/
  server bytes could be delivered after the application permit
  releases. This is NOT a last-byte guarantee.
- A hung client can indefinitely stall revocation; no auto-expiry
  may be equated to a proven delivered byte. Operational eviction,
  client cancellation and monotonic bounded leases need design.
- Existing global CDN caches are not invalidated by no-store or a
  JS lock. A live zone-wide purge receipt is missing.
- A compromised schema owner, superuser, operator or out-of-band
  write can bypass in-DB triggers. External IAM, audited custody,
  separate migrator and signed dual control are missing.
- Native libvips LGPL-3.0-or-later, AGPL-3.0 distribution/network,
  TOPWHIZ/TOPWIZ trademark, original source/picture licenses,
  pricing/affiliate, consent, live AdSense are unapproved.

## Future feasibility gates
For any genuine distributed implementation, evaluate a *per-asset
globally addressable, durable coordinator* (e.g. Cloudflare Durable
Object or equivalent) that is the exclusive authorization and
revocation ingress. Enforce monotonically increasing publication
generations in a durable authoritative store; force all producer
and reader rights mutations through the same coordinator, acquire
generation-bound admission tokens, revoke new admission before
external rights changes, and delay final revoke success until
acknowledged response-stream cancellations and cache purge proofs.
Review crash/retry semantics, coordinator failover, cache/CDN
invalidation, real transport buffering, and downstream last-byte
semantics. If last-byte proof cannot be demonstrated, keep media
private/disabled rather than downgrade the security claim.

No real Cloudflare, Durable Object, Neon, Queue or R2 operations
in this work. Local tests ≠ pen test or independent WCAG audit.

**Release decision: NO-GO until globally coordinated revocation and real HTTP/cache proofs.**
