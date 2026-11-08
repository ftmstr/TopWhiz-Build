# TOPWHIZ TUR016 — Engineering and acceptance report
Date: 2026-11-09 | Public repo: ftmstr/TopWhiz-Build (AGPL-3.0)
Branch: feat/tur016-recovery-provenance-schema-acl-20261109
Parent: TUR015 open/unmerged Draft PR #18, exact SHA 697560320786a548f23ca4fc62a08c8f61cd01a3
Target: stacked Draft PR #19 to TUR015 branch, NEVER main.

## Independent baseline evidence
13/13 inherited TUR015 GitHub Actions workflows reported completed SUCCESS at exact parent SHA 697560320786a548f23ca4fc62a08c8f61cd01a3.
Four TUR015 documents were inspected. Main remains 71c1c866518eec5fb6934d8aba5a4ee4d55ce5e6.
TUR015 preserves 52 Node, 18 PG, 50 Chromium, real local vinext/workerd and locked supplier inventory evidence on its original branch. These are inherited, NOT equivalent to new TUR016 final-head proof.

## Vulnerability remediation
Migration 0015, CI-only, adds a fail-closed trusted schema ACL check:
a named non-owner role with CREATE invalidates SECURITY DEFINER trust even if PUBLIC lacks CREATE.
The migration refuses a public/wrong-owner schema and an absent TUR015 authorization baseline.
It executes transactionally; an error cannot yield a partially installed trigger.

The dedicated BEFORE INSERT SECURITY DEFINER trigger binds immutable grant issued_by
to authenticated database session_user, issued_at to transaction_timestamp(),
requires consumed_at NULL, and refuses expired or >15-minute validity.
This prevents an authorization role with table INSERT from impersonating the creator
or backdating its original record. The function search_path is explicitly pinned
to pg_catalog, trusted CMS schema, pg_temp LAST; no PUBLIC EXECUTE.
Existing independent tw_cms_recovery_authorizer and tw_cms_legacy_recovery roles
remain separate: the broker cannot mint grants, and a valid one-time grant
is still necessary for recovery of an old completed NULL-SHA receipt.

## Evidence to be collected by exact final commit
Real isolated PostgreSQL 16 test:
- explicit named non-owner CREATE privilege => 0015 migration blocked
- failed migration rollback and successful retry after privilege revoked
- issuer impersonation, backdated clock and already-consumed grant rejected
- overlong grant and broker self-authorization rejected
- mismatched digest/ticket denied; correct digest/ticket accepted once
- immutable audit and original receipt reset after permitted claim
New workflow TUR016 adds frozen pnpm, TypeScript and license checks.
Existing 13 workflows must all complete on the FINAL TUR016 HEAD;
do not copy conclusions from earlier commits. Add links/status to PR #19
only when independently confirmed. A CI submission is NOT a PASS.

## Deliberate exclusions
No new live data, image, phone price, source, advertisement, Cloudflare
binding, actual Queues/R2/DLQ, production database migration, domain,
main merge or live Preview. A database test is not a penetration test.
Actual external IAM, signed operator identity and independent approval,
schema-owner operations, CDN invalidation and WCAG field tests still NO-GO.
