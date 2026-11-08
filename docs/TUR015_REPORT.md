# TOPWHIZ TUR015 — Technical development and acceptance report
Date: 2026-11-08
Repo: Public ftmstr/TopWhiz-Build (AGPL-3.0)
Branch: feat/tur015-concurrent-guards-secdef-dlq-20261108
Parent: TUR014 Draft PR #17 exact HEAD b865342f87ba49332a9f26361c520865d2aa3a39
Target: stacked TUR015 Draft PR #18, NOT main.

## Verified baseline
Parent #17 was OPEN/DRAFT/unmerged. Read all four TUR014
technical, security, legacy Queue and licence reports. Exactly
12/12 GitHub workflows on b865342f87ba completed SUCCESS.
Main remained 71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6,
unprotected. No actual production account was touched.

## Engineering
### Migration 0014 — two independent identities and safe DEFINER search_path
The older legacy recovery broker could call its SECURITY DEFINER
reset function using an arbitrary actor/ticket/digest, bypassing the
external JS authorization callback. TUR015 adds a separate,
one-time, event/digest/operator/ticket scoped authorization table,
with at most 15 minutes validity and a consumed-at audit field.
A new NOLOGIN tw_cms_recovery_authorizer can INSERT grants only;
the separate legacy broker can EXECUTE a narrowly scoped reset
but cannot mint grants or directly DELETE receipts.

The reset now fails until an independently authorized matching
grant exists. On success it consumes that grant, appends immutable
audit and resets a legacy NULL-digest receipt in one transaction.
All known CMS SECURITY DEFINER functions, including the existing
single-entry draft intake, have a trusted search_path ordered:
pg_catalog, migrator-owned CMS schema, pg_temp LAST. Reject
untrusted/public schema and unsafe PUBLIC CREATE grants.
A real isolated PostgreSQL recovery-broker LOGIN creates a fake
temporary receipt table; the procedure still operates on the
genuine trusted table and refuses forged tickets or digests.

### 40-record, overlapping-license concurrent revocation test
Create 40 fictional approved news entries: 15 use source A,
15 use source B and 10 use BOTH. Every third record also requires
an independently signed ephemeral Ed25519 reviewer.
Three simultaneous raw source A/source B/issuer UPDATE statements
are rejected by the inherited deferred COMMIT/fence/outbox gate.
Three simultaneous authorized source A, source B and issuer
revocations run with bounded retries ONLY on transaction
deadlock/serialization/guard conflicts. The observed CI run
required [1,1,2] attempts, then successfully withdrew EXACTLY
40 entries and emitted 40 unique withdrawal outbox events,
on top of 40 original publication events. The per-resource
mutation guard ledger intentionally has more than 40 entries:
a story depending on two sources has two independent audit
dependencies. All ledger records map to a valid withdrawal.
Seventy-two concurrent SQL readers see zero revoked public rows.
No licences or content are real.

### Queue/DLQ uncertain-COMMIT and active-lease tests
A synthetic Queue delivery begins before its legacy receipt reset
transaction COMMITs. It must not ACK an unproven old NULL hash.
A separately injected database client performs the actual COMMIT
then deliberately loses its success response; the caller does
NOT ACK the DLQ, but durable audit/grant can be reconciled and
the already accepted Queue event safely redelivered. Purge and
digest-bound durable completion are required before ACK. A still
active processing lease triggers retry, not false completion.
These are mock Queue/PG fault injections; live Cloudflare
exactly-once behavior is NOT claimed.

### Browser, R2 and local Cloudflare workerd
Retain the original vinext/Cloudflare Vite plugin local RSC
App Router and explicit no-store/cache-disabled controls.
96 additional parallel synthetic conditional HTTP requests
(ETag, If-Modified-Since, Range and stale Cache-Control) returned
200/404, never 304; all carried no-store. No real Cloudflare
edge HIT or cache purge was tested.
New 160-way original-generated PNG R2 mock test: 80 approved
byte-verified responses and 80 in-flight rights-denied responses,
plus 32 modified bytes and 32 broken stream failures. No real
R2 bucket or CDN.
Five additional Chromium mobile/tablet/desktop widths
342/428/912/1180/1680, keyboard/semantic landmarks,
automated axe severe/critical, noindex/SEO, fictional licensed
image, 40 local HTTP requests and top/right/bottom inert ad slots.
All inherited browser tests retained.

## GitHub CI proof (successful code HEAD before report creation)
Code SHA 669b073012d09d4c828481da2f9d9792b2d73cca:
https://github.com/ftmstr/TopWhiz-Build/actions/runs/42505200767
All FOUR TUR015 jobs completed SUCCESS:
- 52/52 Node unit/security tests including R2 synthetic race
- 18/18 distinct, ephemeral PostgreSQL 16 integration test commands
- 50/50 real Chromium responsive/axe/SEO tests
- Real local vinext+workerd and 40 baseline +96 new local HTTP probes
- frozen pnpm, TypeScript, Next/vinext, two Wrangler dry-run Workers,
  high/critical production advisory audit and supplier license inventory.
One local CI runner workerd p95 was 328ms, NOT a production metric.
Final report-commit HEAD requires a FRESH full CI verification;
record exact 13/13 workflow results in PR #18 comments, not
merely success of the earlier code SHA.

## Absolute NO-GO
No main merge, Cloudflare Preview/deploy/Access, real CDN purge,
actual R2/Queues/DLQ, production PG/Neon schema migrations,
domain/DNS, real news/phones/specs/photos/prices, merchant feed
or Google AdSense. Qualified legal review, production IAM,
source/photo licences, AGPL/LGPL obligations, TOPWHIZ/TOPWIZ
trademark, real traffic, manual screen-reader and security review
remain outstanding.
