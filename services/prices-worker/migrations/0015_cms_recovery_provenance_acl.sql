-- TOPWHIZ TUR016 — CI-only / NEVER apply to a live PostgreSQL database.
-- A trusted SECURITY DEFINER schema must not be writable by ANY other
-- role, even when PUBLIC itself lacks CREATE (a TUR015 blind spot).
-- Independently authorized recovery grants must preserve the real session
-- login and immutable database issuance time. The authorizer still needs
-- separate real-world IAM, ticket validation and dual approval.
BEGIN;
DO $schema_acl$
DECLARE target text := current_schema();
BEGIN
 IF target IS NULL OR target IN ('public','pg_catalog','information_schema')
    OR NOT EXISTS (
      SELECT 1 FROM pg_namespace n
      WHERE n.nspname=target AND n.nspowner=(
        SELECT oid FROM pg_roles WHERE rolname=current_user
      )
    ) THEN
   RAISE EXCEPTION 'cms_untrusted_schema_owner_or_name';
 END IF;
 -- Reject CREATE by PUBLIC, a named login, or any member/group role.
 -- ACL inheritance can amplify these entries. Merely checking grantee=0
 -- (PUBLIC) misses explicitly granted user/role CREATE privileges.
 IF EXISTS (
   SELECT 1 FROM pg_namespace n
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))
   ) a
   WHERE n.nspname=target AND a.privilege_type='CREATE'
     AND a.grantee<>n.nspowner
 ) THEN
   RAISE EXCEPTION 'cms_schema_create_granted_to_untrusted_role';
 END IF;
 IF to_regclass('cms_legacy_recovery_authorizations') IS NULL
    OR to_regprocedure('cms_claim_legacy_redrive(uuid,varchar,varchar,varchar)') IS NULL THEN
   RAISE EXCEPTION 'tur015_authorization_baseline_required';
 END IF;
END $schema_acl$;

CREATE FUNCTION cms_validate_recovery_grant_provenance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $guard$
BEGIN
 -- session_user is the authenticated database session identity, unlike
 -- current_user inside SECURITY DEFINER (which is the function owner).
 -- INSERT privilege alone must never impersonate another grant issuer.
 IF NEW.issued_by IS DISTINCT FROM session_user THEN
   RAISE EXCEPTION 'cms_recovery_issuer_identity_spoof';
 END IF;
 -- Defaults use transaction_timestamp()/now(); reject client-supplied
 -- historical or future issuance timestamps and already-consumed grants.
 IF NEW.issued_at IS DISTINCT FROM transaction_timestamp()
    OR NEW.consumed_at IS NOT NULL THEN
   RAISE EXCEPTION 'cms_recovery_grant_timestamp_or_consumption_spoof';
 END IF;
 IF NEW.expires_at<=clock_timestamp()
    OR NEW.expires_at>NEW.issued_at+interval '15 minutes' THEN
   RAISE EXCEPTION 'cms_recovery_grant_expiry_invalid';
 END IF;
 RETURN NEW;
END $guard$;

CREATE TRIGGER cms_recovery_grant_origin_gate
BEFORE INSERT ON cms_legacy_recovery_authorizations
FOR EACH ROW EXECUTE FUNCTION cms_validate_recovery_grant_provenance();

-- Pin the newly introduced SECURITY DEFINER routine to the trusted schema,
-- with pg_temp LAST; do not trust a caller-controlled search_path.
DO $pin$
DECLARE target text := current_schema();
BEGIN
 EXECUTE format(
  'ALTER FUNCTION %I.cms_validate_recovery_grant_provenance() SET search_path TO pg_catalog, %I, pg_temp',
  target,target
 );
END $pin$;
REVOKE ALL ON FUNCTION cms_validate_recovery_grant_provenance() FROM PUBLIC;
COMMIT;
