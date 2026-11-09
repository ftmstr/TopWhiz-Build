-- TOPWHIZ TUR018 CI-ONLY: fail closed on original outbox route contract.
-- Never run this migration against Neon/production. Owner/ACL must be
-- independently reviewed. Remains compatible with TUR017 digest encoding.
BEGIN;
DO $preflight$
DECLARE s text:=current_schema();
BEGIN
 IF s IS NULL OR s IN ('public','pg_catalog','information_schema')
  OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_namespace n
   WHERE n.nspname=s AND n.nspowner=(
    SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
  )
  OR EXISTS (
   SELECT 1 FROM pg_catalog.pg_namespace n
   CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
   WHERE n.nspname=s AND a.privilege_type='CREATE' AND a.grantee<>n.nspowner
  ) THEN RAISE EXCEPTION 'tur018_untrusted_cms_schema_acl'; END IF;
 IF to_regprocedure('cms_canonical_recovery_digest(uuid)') IS NULL
  OR to_regprocedure('cms_enforce_recovery_outbox_digest()') IS NULL THEN
  RAISE EXCEPTION 'tur017_canonical_digest_required'; END IF;
END $preflight$;

-- Replaces the existing DEFINER body without changing signature,
-- privileges, trusted owner, semantics for legitimate events or grants.
-- Match JS validatePurgeEvent SAFE_ROUTES and length limit. This blocks
-- granting a purge receipt for even a DB-owner-inserted malformed outbox.
CREATE OR REPLACE FUNCTION cms_canonical_recovery_digest(p_event_id uuid)
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
    )
    OR EXISTS(
     SELECT 1 FROM pg_catalog.jsonb_array_elements_text(original.routes) v(route)
     WHERE pg_catalog.length(v.route)>255 OR NOT (
       v.route='/' OR v.route='/karsilastir' OR
       v.route ~ '^/haberler(/[a-z0-9]+(-[a-z0-9]+)*)?$' OR
       v.route ~ '^/telefonlar(/[a-z0-9]+(-[a-z0-9]+)*)?$'
     )
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

-- Existing recovery broker/issuer permissions stay unchanged.
DO $pin$
DECLARE s text:=current_schema();
BEGIN
 EXECUTE pg_catalog.format(
 'ALTER FUNCTION %I.cms_canonical_recovery_digest(uuid) SET search_path TO pg_catalog, %I, pg_temp',
 s,s);
END $pin$;
REVOKE ALL ON FUNCTION cms_canonical_recovery_digest(uuid) FROM PUBLIC;
COMMIT;
