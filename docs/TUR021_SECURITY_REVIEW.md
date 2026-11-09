# TOPWHIZ TUR021 — Distributed authorization, rights and final-byte security
Date 2026-11-09 | CI-only PostgreSQL16 security experiment
Status: NO-GO. R2 Issue #22 OPEN.

## What is now durable (within isolated PostgreSQL)
Shared PG16-backed per-asset generation and opaque read permits
coordinate otherwise independent DB client sessions. Row-level
locks serialize new admission vs. beginning revocation. SQL mutation
of cms_media_assets.rights_approved=false and the generation
transition to REVOKED happen together under one DB transaction.
If the SQL COMMIT response is lost after a durable successful
COMMIT, readback identifies state; a rolled-back COMMIT leaves
admission sealed in the earlier durable REVOKING state. One
capability cannot be reconsumed to increment generation twice.

The migration owns no live worker auth path. It grants EXECUTE
to NO new production identities; PUBLIC and table privileges
are revoked. Synthetic test sessions have separate narrow grants.
The SECURITY DEFINER preflight checks function/schema owner and
every named/PUBLIC CREATE grant at EACH execution; pg_temp is last
in search_path. This is not protection from a schema owner or
superuser replacing the code.

## Hard open threats and truthful negative evidence
1. **Last network byte remains UNPROVEN**. The caller supplies
   local 'drained' or 'cancelled' flags; it is not a cryptographic
   or transport-verified receipt. A malicious/buggy reader could
   close the permit before actual HTTP bytes reached the client.
   The TUR020 5-byte buffered-transport counterexample remains.
2. Any out-of-band schema owner/migrator/rights-admin UPDATE to
   cms_media_assets can bypass this new fence even while a
   read is enrolled. The real inherited CMS rights mutation
   roles still require comprehensive integration/least-privilege
   migration; synthetic test intentionally demonstrates bypass.
3. Real Cloudflare Worker routes, Durable Objects and zones are
   NOT wired to PostgreSQL fence. Real R2 media-handler still
   exhibits the TUR018 original 12-after-final-check/99,276-byte
   negative case; the original test remains unchanged.
4. Old global CDN objects remain untouched by no-store and local
   validators. A genuine independently authorized zone cache
   purge and receipt are absent.
5. A permit that never completes stalls revocation; this
   prototype deliberately does NOT treat timeouts/leases as
   proof of final-byte arrival. Reconciliation needs trusted
   cancellation/transport safety semantics.
6. A DB-only linearization point covers DB writes, not R2
   object/CDN propagation or multi-region network response.
   Real release would require exclusive authoritative
   admission/mutation across ALL paths, operator IAM, external
   audit custody, generation/rights check integration, real
   Cloudflare failure injection and manual security testing.
7. Database schema-owner/superuser, mis-scoped app roles,
   falsified operator tickets, third-party source/photo rights
   and original news/price feeds are outside this simulation.

PG original outbox canonical SHA/route allowlist, broker vs
issuer roles, Queue/DLQ uncertain COMMIT/active lease,
immutable audit, pnpm frozen lockfile and native LGPL
legal review remain unchanged and mandatory.

AGPL-3.0 source/network obligations, Sharp/libvips LGPL-3.0-or-
later distributions, TOPWHIZ/TOPWIZ trademark, privacy/
AdSense, manual WCAG and real field Web Vitals NOT approved.

**Release decision: NO-GO; Issue #22 OPEN** until a genuine
global last-byte/rights revocation design and independent
acceptance makes such a guarantee supportable.
