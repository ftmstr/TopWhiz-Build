-- TEMPLATE ONLY: replace __TOPWHIZ_SCHEMA__ with a verified schema identifier.
-- Run as database owner, AFTER migrations, in approved nonproduction first.
-- The six NOLOGIN roles receive account-specific membership through
-- separate secret-managed provisioning, NOT from this repository.
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tw_cms_intake') THEN
   CREATE ROLE tw_cms_intake NOLOGIN NOINHERIT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tw_cms_attestor') THEN
   CREATE ROLE tw_cms_attestor NOLOGIN NOINHERIT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tw_cms_reviewer') THEN
   CREATE ROLE tw_cms_reviewer NOLOGIN NOINHERIT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tw_cms_publisher') THEN
   CREATE ROLE tw_cms_publisher NOLOGIN NOINHERIT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tw_cms_rights_admin') THEN
   CREATE ROLE tw_cms_rights_admin NOLOGIN NOINHERIT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tw_cms_reader') THEN
   CREATE ROLE tw_cms_reader NOLOGIN NOINHERIT;
 END IF;
END $roles$;
REVOKE ALL ON ALL TABLES IN SCHEMA __TOPWHIZ_SCHEMA__ FROM PUBLIC;
REVOKE ALL ON SCHEMA __TOPWHIZ_SCHEMA__ FROM PUBLIC;
GRANT USAGE ON SCHEMA __TOPWHIZ_SCHEMA__ TO
 tw_cms_intake,tw_cms_attestor,tw_cms_reviewer,tw_cms_publisher,tw_cms_reader,tw_cms_rights_admin;

-- Draft intake: SECURITY DEFINER minimizes exposure to other users' drafts.
-- Owner of this function must be a restricted migrator (NOT service identity).
CREATE OR REPLACE FUNCTION __TOPWHIZ_SCHEMA__.cms_ingest_draft(
 p_external_key varchar,p_type varchar,p_slug varchar,p_payload jsonb)
RETURNS TABLE(id uuid,revision_no integer,state varchar,replay boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,__TOPWHIZ_SCHEMA__ AS $fn$
DECLARE existing_record RECORD;
BEGIN
 IF p_external_key IS NULL OR p_external_key !~ '^[A-Za-z0-9_.:-]{1,160}

-- External authority can submit attestations, but cannot issue review grants.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.cms_review_authorities TO tw_cms_attestor;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.cms_external_attestations TO tw_cms_attestor;
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions TO tw_cms_attestor;

-- Verifier reads independent evidence and only adds scoped review grants.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets,
 __TOPWHIZ_SCHEMA__.cms_review_authorities,
 __TOPWHIZ_SCHEMA__.cms_external_attestations,
 __TOPWHIZ_SCHEMA__.cms_review_grants TO tw_cms_reviewer;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.cms_review_grants TO tw_cms_reviewer;

-- Publisher: updates public versions/route/outbox but cannot forge source
-- rights, reviewer identity, external attestations, or new review grants.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets,
 __TOPWHIZ_SCHEMA__.cms_review_grants,
 __TOPWHIZ_SCHEMA__.published_content_versions,
 __TOPWHIZ_SCHEMA__.published_route_bindings,
 __TOPWHIZ_SCHEMA__.cms_delivery_outbox,
 __TOPWHIZ_SCHEMA__.cms_public_dependencies TO tw_cms_publisher;
GRANT UPDATE ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_delivery_outbox TO tw_cms_publisher;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.published_content_versions,
 __TOPWHIZ_SCHEMA__.published_route_bindings,
 __TOPWHIZ_SCHEMA__.content_rights_audit,
 __TOPWHIZ_SCHEMA__.cms_delivery_outbox,
 __TOPWHIZ_SCHEMA__.cms_public_dependencies TO tw_cms_publisher;
GRANT DELETE ON __TOPWHIZ_SCHEMA__.published_route_bindings TO tw_cms_publisher;

-- Rights authority cannot forge a reviewer signature or publish a new page.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets,
 __TOPWHIZ_SCHEMA__.published_route_bindings,
 __TOPWHIZ_SCHEMA__.cms_public_dependencies
 TO tw_cms_rights_admin;
GRANT UPDATE(rights_approved) ON __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets TO tw_cms_rights_admin;
GRANT UPDATE(state,revision_no,updated_at) ON __TOPWHIZ_SCHEMA__.content_submissions
 TO tw_cms_rights_admin;
GRANT DELETE ON __TOPWHIZ_SCHEMA__.published_route_bindings TO tw_cms_rights_admin;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.cms_delivery_outbox,
 __TOPWHIZ_SCHEMA__.cms_rights_revocations TO tw_cms_rights_admin;

-- Reader cannot access submission/draft, license evidence, review tables.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.cms_public_pages,
 __TOPWHIZ_SCHEMA__.cms_public_media TO tw_cms_reader;

-- For any new table, default is NO PUBLIC grant. Do not grant owner,
-- superuser, CREATE or bypassrls privileges to service identities.

   OR p_type NOT IN ('news','phone')
   OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*

-- External authority can submit attestations, but cannot issue review grants.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.cms_review_authorities TO tw_cms_attestor;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.cms_external_attestations TO tw_cms_attestor;
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions TO tw_cms_attestor;

-- Verifier reads independent evidence and only adds scoped review grants.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets,
 __TOPWHIZ_SCHEMA__.cms_review_authorities,
 __TOPWHIZ_SCHEMA__.cms_external_attestations,
 __TOPWHIZ_SCHEMA__.cms_review_grants TO tw_cms_reviewer;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.cms_review_grants TO tw_cms_reviewer;

-- Publisher: updates public versions/route/outbox but cannot forge source
-- rights, reviewer identity, external attestations, or new review grants.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets,
 __TOPWHIZ_SCHEMA__.cms_review_grants,
 __TOPWHIZ_SCHEMA__.published_content_versions,
 __TOPWHIZ_SCHEMA__.published_route_bindings,
 __TOPWHIZ_SCHEMA__.cms_delivery_outbox,
 __TOPWHIZ_SCHEMA__.cms_public_dependencies TO tw_cms_publisher;
GRANT UPDATE ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_delivery_outbox TO tw_cms_publisher;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.published_content_versions,
 __TOPWHIZ_SCHEMA__.published_route_bindings,
 __TOPWHIZ_SCHEMA__.content_rights_audit,
 __TOPWHIZ_SCHEMA__.cms_delivery_outbox,
 __TOPWHIZ_SCHEMA__.cms_public_dependencies TO tw_cms_publisher;
GRANT DELETE ON __TOPWHIZ_SCHEMA__.published_route_bindings TO tw_cms_publisher;

-- Rights authority cannot forge a reviewer signature or publish a new page.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets,
 __TOPWHIZ_SCHEMA__.published_route_bindings,
 __TOPWHIZ_SCHEMA__.cms_public_dependencies
 TO tw_cms_rights_admin;
GRANT UPDATE(rights_approved) ON __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets TO tw_cms_rights_admin;
GRANT UPDATE(state,revision_no,updated_at) ON __TOPWHIZ_SCHEMA__.content_submissions
 TO tw_cms_rights_admin;
GRANT DELETE ON __TOPWHIZ_SCHEMA__.published_route_bindings TO tw_cms_rights_admin;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.cms_delivery_outbox,
 __TOPWHIZ_SCHEMA__.cms_rights_revocations TO tw_cms_rights_admin;

-- Reader cannot access submission/draft, license evidence, review tables.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.cms_public_pages,
 __TOPWHIZ_SCHEMA__.cms_public_media TO tw_cms_reader;

-- For any new table, default is NO PUBLIC grant. Do not grant owner,
-- superuser, CREATE or bypassrls privileges to service identities.

   OR length(p_slug)>100 OR jsonb_typeof(p_payload)<>'object'
   OR length(p_payload::text)>65536
   OR p_payload->>'type'<>p_type OR p_payload->>'slug'<>p_slug
 THEN RAISE EXCEPTION 'invalid_submission'; END IF;

 INSERT INTO __TOPWHIZ_SCHEMA__.content_submissions AS s
  (external_key,content_type,slug,payload,state)
 VALUES(p_external_key,p_type,p_slug,p_payload,'pending_review')
 ON CONFLICT(external_key) DO NOTHING
 RETURNING s.id,s.revision_no,s.state INTO existing_record;
 IF FOUND THEN
   id:=existing_record.id;revision_no:=existing_record.revision_no;
   state:=existing_record.state;replay:=false;RETURN NEXT;RETURN;
 END IF;
 SELECT s.id,s.revision_no,s.state,s.payload
  INTO existing_record FROM __TOPWHIZ_SCHEMA__.content_submissions s
  WHERE s.external_key=p_external_key FOR UPDATE;
 IF NOT FOUND OR existing_record.payload IS DISTINCT FROM p_payload
 THEN RAISE EXCEPTION 'external_key_conflict'; END IF;
 id:=existing_record.id;revision_no:=existing_record.revision_no;
 state:=existing_record.state;replay:=true;RETURN NEXT;
END $fn$;
REVOKE ALL ON FUNCTION __TOPWHIZ_SCHEMA__.cms_ingest_draft(
 varchar,varchar,varchar,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION __TOPWHIZ_SCHEMA__.cms_ingest_draft(
 varchar,varchar,varchar,jsonb) TO tw_cms_intake;

-- External authority can submit attestations, but cannot issue review grants.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.cms_review_authorities TO tw_cms_attestor;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.cms_external_attestations TO tw_cms_attestor;
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions TO tw_cms_attestor;

-- Verifier reads independent evidence and only adds scoped review grants.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets,
 __TOPWHIZ_SCHEMA__.cms_review_authorities,
 __TOPWHIZ_SCHEMA__.cms_external_attestations,
 __TOPWHIZ_SCHEMA__.cms_review_grants TO tw_cms_reviewer;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.cms_review_grants TO tw_cms_reviewer;

-- Publisher: updates public versions/route/outbox but cannot forge source
-- rights, reviewer identity, external attestations, or new review grants.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets,
 __TOPWHIZ_SCHEMA__.cms_review_grants,
 __TOPWHIZ_SCHEMA__.published_content_versions,
 __TOPWHIZ_SCHEMA__.published_route_bindings,
 __TOPWHIZ_SCHEMA__.cms_delivery_outbox,
 __TOPWHIZ_SCHEMA__.cms_public_dependencies TO tw_cms_publisher;
GRANT UPDATE ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_delivery_outbox TO tw_cms_publisher;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.published_content_versions,
 __TOPWHIZ_SCHEMA__.published_route_bindings,
 __TOPWHIZ_SCHEMA__.content_rights_audit,
 __TOPWHIZ_SCHEMA__.cms_delivery_outbox,
 __TOPWHIZ_SCHEMA__.cms_public_dependencies TO tw_cms_publisher;
GRANT DELETE ON __TOPWHIZ_SCHEMA__.published_route_bindings TO tw_cms_publisher;

-- Rights authority cannot forge a reviewer signature or publish a new page.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.content_submissions,
 __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets,
 __TOPWHIZ_SCHEMA__.published_route_bindings,
 __TOPWHIZ_SCHEMA__.cms_public_dependencies
 TO tw_cms_rights_admin;
GRANT UPDATE(rights_approved) ON __TOPWHIZ_SCHEMA__.cms_trusted_sources,
 __TOPWHIZ_SCHEMA__.cms_media_assets TO tw_cms_rights_admin;
GRANT UPDATE(state,revision_no,updated_at) ON __TOPWHIZ_SCHEMA__.content_submissions
 TO tw_cms_rights_admin;
GRANT DELETE ON __TOPWHIZ_SCHEMA__.published_route_bindings TO tw_cms_rights_admin;
GRANT INSERT ON __TOPWHIZ_SCHEMA__.cms_delivery_outbox,
 __TOPWHIZ_SCHEMA__.cms_rights_revocations TO tw_cms_rights_admin;

-- Reader cannot access submission/draft, license evidence, review tables.
GRANT SELECT ON __TOPWHIZ_SCHEMA__.cms_public_pages,
 __TOPWHIZ_SCHEMA__.cms_public_media TO tw_cms_reader;

-- For any new table, default is NO PUBLIC grant. Do not grant owner,
-- superuser, CREATE or bypassrls privileges to service identities.
