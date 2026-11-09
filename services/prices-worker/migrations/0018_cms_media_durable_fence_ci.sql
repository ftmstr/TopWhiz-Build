-- TOPWHIZ TUR021: disposable PostgreSQL 16 simulation ONLY.
-- DO NOT apply to production/Neon. This is neither a Cloudflare Durable
-- Object implementation nor a final-client-byte authorization guarantee.
-- The *same* database state is deliberately visible to separate sessions.
BEGIN;
DO $preflight$
DECLARE s text:=pg_catalog.current_schema();
BEGIN
 IF s IS NULL OR s IN ('public','pg_catalog','information_schema')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_namespace n
      WHERE n.nspname=s AND n.nspowner=(
        SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
    ) OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_namespace n
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
      WHERE n.nspname=s AND a.privilege_type='CREATE'
        AND a.grantee<>n.nspowner
    )
 THEN RAISE EXCEPTION 'tur021_untrusted_owner_or_schema_create'; END IF;
 IF pg_catalog.to_regprocedure('cms_canonical_recovery_digest(uuid)') IS NULL
 THEN RAISE EXCEPTION 'tur021_original_outbox_baseline_missing'; END IF;
END $preflight$;

-- These are new CI-only tables. No default role grants or automatic
-- provision of previously published assets. Enrollment is migrator-only.
CREATE TABLE cms_media_fence_state (
 asset_id varchar(160) PRIMARY KEY REFERENCES cms_media_assets(id),
 generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
 phase varchar(16) NOT NULL DEFAULT 'open'
  CHECK(phase IN ('open','revoking','revoked')),
 revocation_token uuid,
 CHECK ((phase='revoking') = (revocation_token IS NOT NULL))
);
CREATE TABLE cms_media_fence_permits (
 token uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 asset_id varchar(160) NOT NULL REFERENCES cms_media_fence_state(asset_id),
 generation bigint NOT NULL CHECK(generation>0),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 released_at timestamptz,
 release_reason varchar(16)
  CHECK(release_reason IS NULL OR release_reason IN ('drained','cancelled')),
 CHECK ((released_at IS NULL)=(release_reason IS NULL))
);
CREATE INDEX cms_media_fence_active_idx
 ON cms_media_fence_permits(asset_id)
 WHERE released_at IS NULL;
REVOKE ALL ON cms_media_fence_state,cms_media_fence_permits FROM PUBLIC;

CREATE FUNCTION cms_media_fence_preflight()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
DECLARE s text; schema_owner oid; fn_owner oid;
BEGIN
 SELECT n.nspname,n.nspowner,p.proowner INTO s,schema_owner,fn_owner
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n
   ON n.oid=p.pronamespace
 WHERE p.oid=pg_catalog.to_regprocedure('cms_media_fence_preflight()');
 IF s IS NULL OR s IN ('public','pg_catalog','information_schema')
    OR schema_owner<>fn_owner
    OR schema_owner<>(SELECT oid FROM pg_catalog.pg_roles
      WHERE rolname=current_user)
    OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_namespace n
      CROSS JOIN LATERAL pg_catalog.aclexplode(
       coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
      WHERE n.nspname=s AND a.privilege_type='CREATE'
        AND a.grantee<>schema_owner
    )
 THEN RAISE EXCEPTION 'cms_media_fence_runtime_acl_or_owner_drift'; END IF;
END $fn$;

-- Approval and public use are STILL checked in the existing media-handler.
-- This gate adds only a synthetic durable generation/enrollment contract.
-- Every reading client and every mutator MUST use this same DB ledger
-- to obtain its limited invariant; production integration is NOT present.
CREATE FUNCTION cms_media_fence_admit(p_asset varchar)
RETURNS TABLE(permit_token uuid,publication_generation bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
DECLARE v_phase text; v_generation bigint; v_rights boolean;
BEGIN
 PERFORM cms_media_fence_preflight();
 SELECT f.phase,f.generation,a.rights_approved
 INTO v_phase,v_generation,v_rights
 FROM cms_media_fence_state f JOIN cms_media_assets a
   ON a.id=f.asset_id
 WHERE f.asset_id=p_asset
 FOR UPDATE OF f,a;
 IF NOT FOUND OR v_phase<>'open' OR v_rights IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'cms_media_fence_admission_denied'; END IF;
 permit_token:=pg_catalog.gen_random_uuid();
 publication_generation:=v_generation;
 INSERT INTO cms_media_fence_permits(token,asset_id,generation)
 VALUES(permit_token,p_asset,publication_generation);
 RETURN NEXT;
END $fn$;

-- This is a LOCAL STREAM terminal assertion from an untrusted caller,
-- NOT a verifiable HTTP/transport-level last-byte receipt.
CREATE FUNCTION cms_media_fence_release(p_token uuid,p_reason varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
BEGIN
 PERFORM cms_media_fence_preflight();
 IF p_reason NOT IN ('drained','cancelled') OR p_reason IS NULL
 THEN RAISE EXCEPTION 'cms_media_fence_terminal_evidence_invalid'; END IF;
 UPDATE cms_media_fence_permits
 SET released_at=pg_catalog.clock_timestamp(),release_reason=p_reason
 WHERE token=p_token AND released_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'cms_media_fence_unknown_or_reused_permit';
 END IF;
 RETURN true;
END $fn$;

CREATE FUNCTION cms_media_fence_begin_revoke(
 p_asset varchar,p_expected_generation bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
DECLARE v_phase text; v_generation bigint; v_token uuid;
BEGIN
 PERFORM cms_media_fence_preflight();
 SELECT phase,generation INTO v_phase,v_generation
 FROM cms_media_fence_state WHERE asset_id=p_asset FOR UPDATE;
 IF NOT FOUND OR v_phase<>'open' THEN
  RAISE EXCEPTION 'cms_media_fence_already_closed'; END IF;
 IF p_expected_generation IS NULL OR v_generation<>p_expected_generation
 THEN RAISE EXCEPTION 'cms_media_fence_stale_generation'; END IF;
 v_token:=pg_catalog.gen_random_uuid();
 UPDATE cms_media_fence_state
 SET phase='revoking',revocation_token=v_token WHERE asset_id=p_asset;
 RETURN v_token;
END $fn$;

-- No network send between two DB writes: rights flag and fence generation
-- transition occur in ONE PostgreSQL transaction. Crash/COMMIT-ACK loss:
-- re-read durable state; revoked means committed, revoking means retry.
-- No expiry can infer completion from silent/stalled clients.
CREATE FUNCTION cms_media_fence_commit_revoke(p_asset varchar,p_token uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
DECLARE v_phase text; v_token uuid; n bigint; next_generation bigint;
BEGIN
 PERFORM cms_media_fence_preflight();
 SELECT phase,revocation_token INTO v_phase,v_token
 FROM cms_media_fence_state WHERE asset_id=p_asset FOR UPDATE;
 IF NOT FOUND OR v_phase<>'revoking' OR v_token IS DISTINCT FROM p_token
 THEN RAISE EXCEPTION 'cms_media_fence_revoke_token_or_phase_invalid'; END IF;
 SELECT pg_catalog.count(*) INTO n
 FROM cms_media_fence_permits
 WHERE asset_id=p_asset AND released_at IS NULL;
 IF n<>0 THEN RAISE EXCEPTION 'cms_media_fence_active_local_permits'; END IF;
 UPDATE cms_media_assets SET rights_approved=false WHERE id=p_asset;
 IF NOT FOUND THEN RAISE EXCEPTION 'cms_media_fence_asset_missing'; END IF;
 UPDATE cms_media_fence_state
 SET phase='revoked',generation=generation+1,revocation_token=NULL
 WHERE asset_id=p_asset RETURNING generation INTO next_generation;
 RETURN next_generation;
END $fn$;

-- Explicit schema owner controls only; NO new role grants. No production
-- role receives arbitrary table writes or new SECURITY DEFINER EXECUTE.
DO $pin$
DECLARE s text:=pg_catalog.current_schema(); f text;
BEGIN
 FOREACH f IN ARRAY ARRAY[
  'cms_media_fence_preflight()',
  'cms_media_fence_admit(character varying)',
  'cms_media_fence_release(uuid,character varying)',
  'cms_media_fence_begin_revoke(character varying,bigint)',
  'cms_media_fence_commit_revoke(character varying,uuid)'
 ] LOOP
  EXECUTE pg_catalog.format(
   'ALTER FUNCTION %I.%s SET search_path TO pg_catalog, %I, pg_temp',
   s,f,s);
 END LOOP;
END $pin$;
REVOKE ALL ON FUNCTION cms_media_fence_preflight() FROM PUBLIC;
REVOKE ALL ON FUNCTION cms_media_fence_admit(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION cms_media_fence_release(uuid,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION cms_media_fence_begin_revoke(varchar,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION cms_media_fence_commit_revoke(varchar,uuid) FROM PUBLIC;
COMMIT;
