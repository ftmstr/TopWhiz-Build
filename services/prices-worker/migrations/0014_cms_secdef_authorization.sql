-- TOPWHIZ TUR015: CI-only. Requires explicit independent authorization for
-- every legacy receipt reset, and hardens ALL known CMS SECURITY DEFINER
-- procedures against pg_temp function/table shadowing. Never apply on live DB
-- or a schema whose OWNER/ACL/search_path is not independently reviewed.
BEGIN;
CREATE TABLE cms_legacy_recovery_authorizations(
 event_id uuid PRIMARY KEY REFERENCES cms_delivery_outbox(id),
 event_sha256 varchar(64) NOT NULL CHECK(event_sha256 ~ '^[a-f0-9]{64}$'),
 ticket_ref varchar(240) NOT NULL CHECK(length(trim(ticket_ref))>=8),
 operator_id varchar(120) NOT NULL CHECK(length(trim(operator_id))>=3),
 issued_by name NOT NULL DEFAULT session_user,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '15 minutes'),
 consumed_at timestamptz
);
CREATE INDEX cms_legacy_recovery_expiry_idx
 ON cms_legacy_recovery_authorizations(expires_at) WHERE consumed_at IS NULL;
REVOKE ALL ON cms_legacy_recovery_authorizations FROM PUBLIC;

-- The recovery broker role is distinct from an independent grant-ISSUER.
-- A broker's direct call with a fake operator/ticket/digest must fail.
CREATE OR REPLACE FUNCTION cms_claim_legacy_redrive(
 p_event_id uuid,p_digest varchar,p_actor varchar,p_ticket varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
DECLARE prior RECORD;
BEGIN
 IF p_event_id IS NULL OR p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$'
   OR p_actor IS NULL OR length(trim(p_actor))<3 OR length(p_actor)>120
   OR p_ticket IS NULL OR length(trim(p_ticket))<8 OR length(p_ticket)>240
 THEN RAISE EXCEPTION 'invalid_legacy_recovery_ticket'; END IF;

 -- Verify separate, time-limited approval before modifying receipts.
 -- A signed/authorized operator assertion in JS is not enough.
 PERFORM 1 FROM cms_legacy_recovery_authorizations a
  WHERE a.event_id=p_event_id
    AND a.event_sha256=p_digest
    AND a.operator_id=trim(p_actor)
    AND a.ticket_ref=trim(p_ticket)
    AND a.issued_at<=now()
    AND a.expires_at>now()
    AND a.consumed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'independent_recovery_grant_required'; END IF;

 PERFORM 1 FROM cms_delivery_outbox WHERE id=p_event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'legacy_event_missing_from_original_outbox'; END IF;
 SELECT status,event_sha256 INTO prior
  FROM cms_purge_receipts WHERE event_id=p_event_id FOR UPDATE;
 IF NOT FOUND OR prior.status<>'completed' OR prior.event_sha256 IS NOT NULL
 THEN RAISE EXCEPTION 'legacy_receipt_not_eligible_for_redrive'; END IF;

 INSERT INTO cms_legacy_receipt_recovery_audit
   (event_id,event_sha256,operator_id,ticket_ref,original_status,outcome)
 VALUES(p_event_id,p_digest,trim(p_actor),trim(p_ticket),'completed','replay_enqueued');

 UPDATE cms_legacy_recovery_authorizations SET consumed_at=now()
  WHERE event_id=p_event_id AND consumed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'legacy_grant_consumption_conflict'; END IF;
 DELETE FROM cms_purge_receipts
  WHERE event_id=p_event_id AND status='completed' AND event_sha256 IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'legacy_receipt_reset_race'; END IF;
 RETURN TRUE;
END $fn$;
REVOKE ALL ON FUNCTION cms_claim_legacy_redrive(uuid,varchar,varchar,varchar) FROM PUBLIC;

-- An authorization is immutable except for the definer's one-time
-- consumed_at marker. Ordinary clients cannot UPDATE this table anyway.
CREATE FUNCTION cms_prevent_recovery_grant_tamper() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $fn$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') OR
    OLD.event_id IS DISTINCT FROM NEW.event_id OR
    OLD.event_sha256 IS DISTINCT FROM NEW.event_sha256 OR
    OLD.ticket_ref IS DISTINCT FROM NEW.ticket_ref OR
    OLD.operator_id IS DISTINCT FROM NEW.operator_id OR
    OLD.issued_by IS DISTINCT FROM NEW.issued_by OR
    OLD.issued_at IS DISTINCT FROM NEW.issued_at OR
    OLD.expires_at IS DISTINCT FROM NEW.expires_at OR
    (OLD.consumed_at IS NOT NULL AND
      OLD.consumed_at IS DISTINCT FROM NEW.consumed_at) THEN
   RAISE EXCEPTION 'cms_recovery_authorization_immutable';
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER cms_recovery_grant_no_update BEFORE UPDATE
 ON cms_legacy_recovery_authorizations FOR EACH ROW
 EXECUTE FUNCTION cms_prevent_recovery_grant_tamper();

-- A deliberate lifecycle separation: the authorization ID cannot be
-- reused, and a user with only the reset EXECUTE permission cannot mint
-- independent grants. No serializable claim of global cloud exactly-once.
DO $hardening$
DECLARE
 target text:=current_schema();
 proc record;
BEGIN
 IF target IS NULL OR target IN ('public','pg_catalog','information_schema')
  OR EXISTS (
    SELECT 1 FROM pg_namespace n
    JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a ON true
    WHERE n.nspname=target AND a.grantee=0 AND a.privilege_type='CREATE'
  ) THEN
  RAISE EXCEPTION 'untrusted_cms_security_definer_schema';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM pg_namespace n
   WHERE n.nspname=target AND n.nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
 ) THEN RAISE EXCEPTION 'cms_schema_owner_required_for_hardening'; END IF;
 FOR proc IN
   SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname=target AND p.prosecdef
     AND p.proname IN(
       'cms_capture_sensitive_mutation',
       'cms_verify_mutation_outbox_before_commit',
       'cms_reject_protected_removal',
       'cms_claim_legacy_redrive',
       'cms_prevent_recovery_grant_tamper'
     )
 LOOP
  EXECUTE format(
   'ALTER FUNCTION %I.%I(%s) SET search_path TO pg_catalog, %I, pg_temp',
   target,proc.proname,proc.args,target
  );
 END LOOP;
END $hardening$;
REVOKE ALL ON FUNCTION cms_prevent_recovery_grant_tamper() FROM PUBLIC;
COMMIT;
