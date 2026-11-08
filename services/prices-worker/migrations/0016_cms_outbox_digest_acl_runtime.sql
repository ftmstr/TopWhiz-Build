-- TOPWHIZ TUR017: CI ONLY. NEVER execute on production/Neon.
-- Bind independent recovery authorizations to the ORIGINAL transaction outbox
-- with a PostgreSQL-computed canonical SHA-256, not an issuer-supplied digest.
-- Recheck trusted-schema CREATE ACL on every grant INSERT / consumption.
BEGIN;

DO $preflight$
DECLARE s text:=current_schema();
BEGIN
 IF s IS NULL OR s IN ('public','pg_catalog','information_schema')
    OR NOT EXISTS (SELECT 1 FROM pg_namespace n
      WHERE n.nspname=s AND n.nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
    OR EXISTS (
      SELECT 1 FROM pg_namespace n
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
      WHERE n.nspname=s AND a.privilege_type='CREATE'
        AND a.grantee<>n.nspowner
    ) THEN
   RAISE EXCEPTION 'cms_recovery_untrusted_schema_acl';
 END IF;
 IF to_regclass('cms_legacy_recovery_authorizations') IS NULL
    OR to_regprocedure('cms_validate_recovery_grant_provenance()') IS NULL THEN
   RAISE EXCEPTION 'tur016_grant_provenance_baseline_required';
 END IF;
END $preflight$;

-- PostgreSQL 16 built-in SHA-256. Do not silently bring in pgcrypto or
-- mutate frozen pnpm dependencies. Canonical encoding mirrors JS:
-- JSON.stringify({eventId,submissionId,revision,kind,routes}) with ordered
-- unique routes (validatePurgeEvent removes duplicates preserving first).
CREATE FUNCTION cms_canonical_recovery_digest(p_event_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
DECLARE
 trusted_schema text;
 schema_owner oid;
 original RECORD;
 route_items text;
 canonical text;
BEGIN
 SELECT n.nspname,n.nspowner INTO trusted_schema,schema_owner
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE p.oid=pg_catalog.to_regprocedure('cms_canonical_recovery_digest(uuid)');
 IF trusted_schema IS NULL
    OR trusted_schema IN ('public','pg_catalog','information_schema')
    OR schema_owner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
    OR EXISTS(
     SELECT 1 FROM pg_catalog.pg_namespace n
     CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
     WHERE n.nspname=trusted_schema AND a.privilege_type='CREATE'
       AND a.grantee<>schema_owner
    ) THEN
   RAISE EXCEPTION 'cms_recovery_schema_acl_drift';
 END IF;
 SELECT id,submission_id,revision_no,event_kind,routes INTO original
 FROM cms_delivery_outbox WHERE id=p_event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'cms_recovery_original_outbox_missing'; END IF;
 IF original.revision_no<1
    OR original.event_kind NOT IN ('published','withdrawn')
    OR pg_catalog.jsonb_typeof(original.routes)<>'array'
    OR pg_catalog.jsonb_array_length(original.routes)>10
    OR EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(original.routes) v(value)
      WHERE pg_catalog.jsonb_typeof(v.value)<>'string'
    ) THEN
   RAISE EXCEPTION 'cms_recovery_original_outbox_invalid';
 END IF;
 SELECT pg_catalog.string_agg(pg_catalog.to_json(route)::text,',' ORDER BY ordinal)
 INTO route_items FROM (
   SELECT val AS route,pg_catalog.min(pos) AS ordinal
   FROM pg_catalog.jsonb_array_elements_text(original.routes)
      WITH ORDINALITY AS elements(val,pos)
   GROUP BY val
 ) unique_routes;
 canonical:=pg_catalog.format(
  '{"eventId":%s,"submissionId":%s,"revision":%s,"kind":%s,"routes":[%s]}',
  pg_catalog.to_json(original.id::text)::text,
  pg_catalog.to_json(original.submission_id::text)::text,
  original.revision_no,
  pg_catalog.to_json(original.event_kind::text)::text,
  coalesce(route_items,'')
 );
 RETURN pg_catalog.encode(
  pg_catalog.sha256(pg_catalog.convert_to(canonical,'UTF8')),'hex');
END $fn$;

-- Covers pre-existing grants issued during TUR015/016 as well:
-- a digest forged BEFORE this migration cannot be consumed AFTER it.
-- Existing immutable grant trigger and separate broker/issuer privileges stay.
CREATE FUNCTION cms_enforce_recovery_outbox_digest()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
BEGIN
 IF NEW.event_sha256 IS DISTINCT FROM
      cms_canonical_recovery_digest(NEW.event_id) THEN
   RAISE EXCEPTION 'cms_recovery_outbox_digest_mismatch';
 END IF;
 RETURN NEW;
END $fn$;

CREATE TRIGGER cms_recovery_outbox_digest_gate
 BEFORE INSERT OR UPDATE ON cms_legacy_recovery_authorizations
 FOR EACH ROW EXECUTE FUNCTION cms_enforce_recovery_outbox_digest();

DO $pin$
DECLARE s text:=current_schema();
BEGIN
 EXECUTE pg_catalog.format(
  'ALTER FUNCTION %I.cms_canonical_recovery_digest(uuid) SET search_path TO pg_catalog, %I, pg_temp',s,s);
 EXECUTE pg_catalog.format(
  'ALTER FUNCTION %I.cms_enforce_recovery_outbox_digest() SET search_path TO pg_catalog, %I, pg_temp',s,s);
END $pin$;
REVOKE ALL ON FUNCTION cms_canonical_recovery_digest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cms_enforce_recovery_outbox_digest() FROM PUBLIC;
COMMIT;
