# TOPWHIZ TUR018 — Security threat model and negative evidence
Date 2026-11-09. Only disposable tests with fictional rights.

## Original outbox contract
TUR017 verified a stored SHA against a trusted DB outbox but did not
check whether every original route was within the public purge
allowlist. TUR018 preserves SHA construction and explicitly aligns
the SQL route contract with JS validatePurgeEvent for known safe
paths. Invalid originals, even with an old signed-looking grant,
cannot reset historical NULL-SHA receipts. SHA is not independent
license, editor or operator authority.

## SECURITY DEFINER, schema owner and role drift
Migration 0017 fails for untrusted schema ownership, PUBLIC CREATE
or direct named-role CREATE. TUR017 still re-checks ACL on grant
INSERT and UPDATE. No runtime role gains owner, TRIGGER, migration,
superuser or BYPASSRLS privileges. An actual schema owner or
superuser can disable these functions and triggers; real migrator
approval, operator IAM, external immutable audit and two-person
signing are required separately. pg_temp is LAST in search_path.

## Unresolved Queue/DLQ/COMMIT concerns
At-least-once Queue sends may duplicate. The original immutable
outbox and digest-bound completed receipt prevent false ACKs.
A lost COMMIT response is ambiguous even if Queue accepts the
message. Active processing lease requires retry; an old NULL-digest
completed marker cannot be trusted. Local PG tests are NOT a proof
of real Cloudflare exactly-once.

## R2 post-final-check / last-byte TOCTOU
Earlier synthetic tests confirm 404/zero bytes if revoked BEFORE
the final rights lookup. TUR018 intentionally schedules revocation
AFTER the lookup but BEFORE the HTTP response. An approved snapshot
may then return 200 and image bytes. This is an open release blocker,
not a security success. No distributed atomic rights fence,
last-byte revalidation, live Cloudflare R2/CDN or global cache purge
has been demonstrated. no-store does NOT erase old edge caches.

## Supply chain and user-facing risks
Next 16.4.5, optional sharp 0.35.5 and native LGPL-3.0-or-later
libvips still require counsel review with AGPL-3.0, notices and
source obligations. TOPWHIZ/TOPWIZ mark, third-party images,
editorial rights, merchant prices, consent and real AdSense remain
unapproved. Axe and synthetic timing are NOT independent WCAG,
penetration testing or field Core Web Vitals certification.
Status: DRAFT ONLY / RELEASE NO-GO.
