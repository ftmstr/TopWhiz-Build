# TUR062 — Independent PG16 guardian anchor vs actual Next media HTTP (2026-11-10)

## Chain
TUR060 canonical Draft PR #65 HEAD `1e84e889fa629b5b3f5edb4249a6c108d08525b2` independently verified 20/20 SUCCESS. Hourly automation already opened TUR061 Draft PR #66 head `301def68a2e2bb4d6b2d053c65d22c22f10d2bc2`; TUR061 not duplicated. TUR062 is directly stacked atop #66. Verify parent and final-HEAD CI independently before acceptance.

## New distinct threat model
On disposable real PostgreSQL16, four separately authenticated non-superuser LOGINs (media reader, rights revoker, media table owner, independent guardian) control **two different tables under different SQL ownership boundaries**. The real Next.js production `next start` loopback HTTP media endpoint and unchanged CMS handler use the existing strict TUR041 CI-only fictional CMS origin preload and originally generated SHA-256 validated PNG. The media table owner cannot mutate guardian-owned anchor; guardian cannot mutate media, and even a correctly pinned media-owner SECURITY DEFINER routine fails to change guardian anchor. Schema CREATE is revoked after installing the fixture. These are positive DB privilege separation properties of the **test fixture**, not external IAM.

The guardian independently COMMITs `revocation_anchor.approved=false,generation=2`; a fresh HTTP GET is STILL 200 because the actual CMS handler's authority lookup reads only the media table. The revoker then COMMITs the media table withdrawal and HTTP 404 follows. Next, a media table owner (non-superuser) overrides its ordinary revocation trigger and reapproves media generation=3: actual Next HTTP returns 200 with fictional bytes again even though the independent guardian anchor remains revoked. This is new **NEGATIVE proof of integration/linearization failure**: isolation of a guardian object is insufficient without an independently enforced read/serve gate.

## Limitations
The guardian schema is a disposable, distinct in-database object, **not external IAM or production Neon**; no actual production security-barrier rights/view, issuer, signed publication, outbox, Cloudflare/R2/CDN, global purge, receiver final-byte ACK, or cross-region failover tested. No release, main merge, domain, real image, merchant price or advertisement. Inherited TUR030 real unknown COMMIT transport cut and TUR053 client abort tests remain; this tour's own SQL COMMIT ACK is acknowledged. Original TUR018 historical 12 interleavings/99,276 fictional unsafe post-withdrawal bytes and TUR019 cross-isolate remain unresolved.
 
Work-package estimate **69/100** (architecture 14/15, UI 12/20, services 21/25, security-evidence 13/20, CI 9/10, public legal 0/10). Subjective, NOT production readiness. Issue #22 OPEN, RELEASE NO-GO.
