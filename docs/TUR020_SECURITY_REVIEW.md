# TOPWHIZ TUR020 — Revocation generation and last-byte threat model
Date: 2026-11-09. Scope: CI-only synthetic model; Issue #22 OPEN.

## What was actually tested
A JS-facade pair points to the SAME serialized, in-memory test
ledger. Atomic per-asset decisions can be used to deny new
admissions once a generation-specific rights revocation begins.
A successful withdrawal callback is forbidden while registered
local permits are active. Ambiguous withdrawal and simulated
restart during commit leave access quarantined. Neither a stale
expected generation nor a reused/guessed permit is accepted.
This is useful executable design evidence, **NOT** globally
durable distributed authorization.

## Explicit failing/counterexample assumptions
1. Two facades with DIFFERENT backing ledgers can concurrently
   disagree. This models Cloudflare isolate split brain when no
   single shared authority is present; the test intentionally
   demonstrates bypass instead of claiming success.
2. A JS client's 'drained' or 'cancelled' event is UNTRUSTED
   network transport evidence. Bytes already buffered by the
   origin/proxy/CDN can arrive AFTER revocation COMMIT; a
   deterministic 5-byte negative example is retained.
3. TUR018's original 12 final-check races and 99,276 fictional
   PNG bytes remain present in node:test, unchanged. The
   unfenced production-path handler still has this exposure.
4. In-memory mocks do not survive process loss and are not
   serializable across Cloudflare regions. A genuine Durable
   Object or external strongly consistent ledger plus outbox
   transaction and attestation would require new design and
   integration, multi-region chaos tests, restart and failover
   validation before any real deployment.
5. A true last-byte guarantee across client TCP, HTTP proxy,
   R2 and cached replicas may be **unachievable as asserted**.
   If not provable, media MUST remain private or the product
   guarantee and threat model must be revised by an explicit
   independent human security decision. A TTL or heartbeat
   is not proof of delivery. Local EOF is not client ACK.
6. Old global CDN objects cannot be removed by no-store alone.
   No true zone purge, R2, Durable Object or live Queue ran.

## Existing SQL and publishing threats
No schema-owner/superuser defense is asserted. Authenticated
mutator, migration owner and real two-person IAM/approval
must be independent. TUR017–TUR019 SECURITY DEFINER trusted
search_path, PUBLIC/named-role CREATE checks and original
outbox SHA gates remain. Parallel Queue/DLQ acceptance and
ambiguous COMMIT do not imply exactly-once purging.
Authoritative audit reconciliation is still required.

## Legal security gates
AGPL-3.0 source/network obligations, native LGPL-3.0-or-later
Sharp/libvips linking/relinking, TOPWHIZ/TOPWIZ trademark,
real media and price-source rights, privacy/AdSense consent,
manual WCAG 2.2 tests and field Web Vitals are NOT approved.

**Release status: NO-GO.** Keep Issue #22 OPEN until an
independently proven globally coordinated, live-tested safe
publication architecture exists.
