-- TOPWHIZ TUR014 — CI-only, fail-closed rights/issuer mutation gate.
-- SECURITY DEFINER trigger search_path is captured at migration time.
-- Run ONLY with a validated, migrator-owned target search_path; never user input.
-- An ordinary UPDATE may be called by a dedicated admin account, but it
-- CANNOT COMMIT while previously public content depends on the changed
-- source/media/issuer/evidence unless the SAME transaction withdraws the
-- affected submission, advances the monotonic fence and writes the outbox.
BEGIN;
CREATE TABLE cms_mutation_guard_ledger(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES content_submissions(id),
 resource_kind varchar(16) NOT NULL
   CHECK(resource_kind IN ('source','media','issuer','evidence')),
 resource_id varchar(160) NOT NULL,
 expected_revision integer NOT NULL CHECK(expected_revision>1),
 login_actor name NOT NULL DEFAULT session_user,
 captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cms_mutation_guard_target_idx
 ON cms_mutation_guard_ledger(submission_id,expected_revision);

CREATE FUNCTION cms_capture_sensitive_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
DECLARE
 impacted_kind varchar(16);
 impacted_id varchar(160);
BEGIN
 IF TG_OP <> 'UPDATE' THEN
   RAISE EXCEPTION 'protected_cms_mutation_delete_forbidden';
 END IF;
 -- A revoked identity/licence is NOT re-approved by toggling a flag.
 -- New identity, independent approval and fresh publisher review required.
 IF TG_TABLE_NAME IN ('cms_trusted_sources','cms_media_assets') THEN
   IF OLD.rights_approved IS NOT DISTINCT FROM NEW.rights_approved THEN
      RETURN NEW;
   END IF;
   IF NEW.rights_approved IS TRUE THEN
      RAISE EXCEPTION 'revoked_license_cannot_be_automatically_reapproved';
   END IF;
   impacted_kind:=CASE WHEN TG_TABLE_NAME='cms_trusted_sources'
                   THEN 'source' ELSE 'media' END;
   impacted_id:=NEW.id;
   INSERT INTO cms_mutation_guard_ledger
     (submission_id,resource_kind,resource_id,expected_revision)
   SELECT DISTINCT s.id,impacted_kind,impacted_id,s.revision_no+1
   FROM content_submissions s
   JOIN LATERAL(
     SELECT v.version FROM published_content_versions v
     WHERE v.submission_id=s.id
       AND v.version=COALESCE(
         (SELECT h.publication_version FROM cms_publication_heads h
          WHERE h.submission_id=s.id),
         (SELECT max(p.version) FROM published_content_versions p
          WHERE p.submission_id=s.id)
       )
   ) pub ON true
   JOIN cms_public_dependencies dep
     ON dep.submission_id=s.id AND dep.version=pub.version
   WHERE s.state='published' AND dep.resource_kind=impacted_kind
     AND dep.resource_id=impacted_id;
 ELSIF TG_TABLE_NAME='cms_review_authorities' THEN
   IF OLD.active IS NOT DISTINCT FROM NEW.active
      AND OLD.public_key_pem IS NOT DISTINCT FROM NEW.public_key_pem THEN
      RETURN NEW;
   END IF;
   IF NEW.active IS TRUE AND OLD.active IS FALSE THEN
     RAISE EXCEPTION 'revoked_issuer_cannot_be_automatically_reapproved';
   END IF;
   impacted_kind:='issuer';
   impacted_id:=NEW.id;
   INSERT INTO cms_mutation_guard_ledger
     (submission_id,resource_kind,resource_id,expected_revision)
   SELECT DISTINCT s.id,impacted_kind,impacted_id,s.revision_no+1
   FROM content_submissions s
   JOIN LATERAL(
     SELECT v.version FROM published_content_versions v
     WHERE v.submission_id=s.id
       AND v.version=COALESCE(
         (SELECT h.publication_version FROM cms_publication_heads h
          WHERE h.submission_id=s.id),
         (SELECT max(p.version) FROM published_content_versions p
          WHERE p.submission_id=s.id)
       )
   ) pub ON true
   JOIN cms_public_issuer_dependencies dep
     ON dep.submission_id=s.id AND dep.version=pub.version
   WHERE s.state='published' AND dep.authority_id=impacted_id;
 ELSIF TG_TABLE_NAME='cms_external_attestations' THEN
   IF OLD.status IS NOT DISTINCT FROM NEW.status
      AND OLD.signature_base64 IS NOT DISTINCT FROM NEW.signature_base64
      AND OLD.verified_at IS NOT DISTINCT FROM NEW.verified_at
      AND OLD.credited_author IS NOT DISTINCT FROM NEW.credited_author THEN
     RETURN NEW;
   END IF;
   IF OLD.status<>'verified' AND NEW.status='verified' THEN
     RAISE EXCEPTION 'revoked_attestation_cannot_be_automatically_reapproved';
   END IF;
   impacted_kind:='evidence';
   impacted_id:=NEW.authority_id;
   INSERT INTO cms_mutation_guard_ledger
     (submission_id,resource_kind,resource_id,expected_revision)
   SELECT DISTINCT s.id,impacted_kind,impacted_id,s.revision_no+1
   FROM content_submissions s
   JOIN LATERAL(
     SELECT v.version FROM published_content_versions v
     WHERE v.submission_id=s.id
       AND v.version=COALESCE(
         (SELECT h.publication_version FROM cms_publication_heads h
          WHERE h.submission_id=s.id),
         (SELECT max(p.version) FROM published_content_versions p
          WHERE p.submission_id=s.id)
       )
   ) pub ON true
   JOIN cms_public_issuer_dependencies dep
     ON dep.submission_id=s.id AND dep.version=pub.version
   WHERE s.state='published' AND s.id=NEW.submission_id
     AND dep.attestation_type=NEW.attestation_type
     AND dep.authority_id=NEW.authority_id;
 ELSE
   RAISE EXCEPTION 'unknown_sensitive_mutation_table';
 END IF;
 RETURN NEW;
END $fn$;

CREATE FUNCTION cms_verify_mutation_outbox_before_commit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM content_submissions s
   JOIN cms_publication_fences f ON f.submission_id=s.id
   WHERE s.id=NEW.submission_id AND s.state='withdrawn'
     AND s.revision_no=NEW.expected_revision
     AND f.state='withdrawn' AND f.generation=NEW.expected_revision
     AND NOT EXISTS (
       SELECT 1 FROM published_route_bindings r
       WHERE r.submission_id=s.id
     )
     AND EXISTS (
       SELECT 1 FROM cms_delivery_outbox o
       WHERE o.submission_id=s.id AND o.revision_no=NEW.expected_revision
         AND o.event_kind='withdrawn'
     )
 ) THEN
   RAISE EXCEPTION 'cms_unfenced_sensitive_mutation_requires_withdrawal_outbox'
     USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER cms_mutation_commit_guard
 AFTER INSERT ON cms_mutation_guard_ledger
 DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION cms_verify_mutation_outbox_before_commit();

-- Capture the dependent public rows when the sensitive row changes,
-- BEFORE the caller has a chance to withdraw them. Audit is immutable.
CREATE TRIGGER cms_source_guard AFTER UPDATE OF rights_approved ON cms_trusted_sources
 FOR EACH ROW EXECUTE FUNCTION cms_capture_sensitive_mutation();
CREATE TRIGGER cms_media_guard AFTER UPDATE OF rights_approved ON cms_media_assets
 FOR EACH ROW EXECUTE FUNCTION cms_capture_sensitive_mutation();
CREATE TRIGGER cms_issuer_guard AFTER UPDATE OF active,public_key_pem ON cms_review_authorities
 FOR EACH ROW EXECUTE FUNCTION cms_capture_sensitive_mutation();
CREATE TRIGGER cms_evidence_guard AFTER UPDATE OF status,signature_base64,verified_at,credited_author
 ON cms_external_attestations
 FOR EACH ROW EXECUTE FUNCTION cms_capture_sensitive_mutation();

CREATE FUNCTION cms_reject_protected_removal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
BEGIN
 RAISE EXCEPTION 'cms_protected_rights_row_cannot_be_deleted_or_truncated'
   USING ERRCODE='42501';
END $fn$;
CREATE TRIGGER cms_source_no_delete BEFORE DELETE ON cms_trusted_sources
 FOR EACH ROW EXECUTE FUNCTION cms_reject_protected_removal();
CREATE TRIGGER cms_media_no_delete BEFORE DELETE ON cms_media_assets
 FOR EACH ROW EXECUTE FUNCTION cms_reject_protected_removal();
CREATE TRIGGER cms_issuer_no_delete BEFORE DELETE ON cms_review_authorities
 FOR EACH ROW EXECUTE FUNCTION cms_reject_protected_removal();
CREATE TRIGGER cms_evidence_no_delete BEFORE DELETE ON cms_external_attestations
 FOR EACH ROW EXECUTE FUNCTION cms_reject_protected_removal();
CREATE TRIGGER cms_source_no_truncate BEFORE TRUNCATE ON cms_trusted_sources
 FOR EACH STATEMENT EXECUTE FUNCTION cms_reject_protected_removal();
CREATE TRIGGER cms_media_no_truncate BEFORE TRUNCATE ON cms_media_assets
 FOR EACH STATEMENT EXECUTE FUNCTION cms_reject_protected_removal();
CREATE TRIGGER cms_issuer_no_truncate BEFORE TRUNCATE ON cms_review_authorities
 FOR EACH STATEMENT EXECUTE FUNCTION cms_reject_protected_removal();
CREATE TRIGGER cms_evidence_no_truncate BEFORE TRUNCATE ON cms_external_attestations
 FOR EACH STATEMENT EXECUTE FUNCTION cms_reject_protected_removal();

REVOKE ALL ON cms_mutation_guard_ledger FROM PUBLIC;
REVOKE ALL ON FUNCTION cms_capture_sensitive_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION cms_verify_mutation_outbox_before_commit() FROM PUBLIC;
REVOKE ALL ON FUNCTION cms_reject_protected_removal() FROM PUBLIC;
COMMIT;
