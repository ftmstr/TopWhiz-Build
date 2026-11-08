-- TOPWHIZ TUR014: a legacy completed receipt (NULL event_sha256)
-- MUST NOT be interpreted as a verified purge. No automatic backfill.
-- Recovery is an explicitly audited, independently approved redrive that
-- only restores the original immutable outbox event for another purge.
BEGIN;
CREATE TABLE cms_legacy_receipt_recovery_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES cms_delivery_outbox(id),
 event_sha256 varchar(64) NOT NULL CHECK(event_sha256 ~ '^[a-f0-9]{64}$'),
 operator_id varchar(120) NOT NULL CHECK(length(trim(operator_id))>=3),
 ticket_ref varchar(240) NOT NULL CHECK(length(trim(ticket_ref))>=8),
 original_status varchar(16) NOT NULL CHECK(original_status='completed'),
 outcome varchar(24) NOT NULL CHECK(outcome='replay_enqueued'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id)
);
-- Only a separately authorized operator broker role can invoke this
-- audited, constrained SECURITY DEFINER one-time reset. No generic DELETE
-- on cms_purge_receipts is ever granted to that service role.
CREATE FUNCTION cms_claim_legacy_redrive(
 p_event_id uuid,p_digest varchar,p_actor varchar,p_ticket varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path FROM CURRENT AS $fn$
DECLARE prior RECORD;
BEGIN
 IF p_event_id IS NULL OR p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$'
    OR p_actor IS NULL OR length(trim(p_actor))<3 OR length(p_actor)>120
    OR p_ticket IS NULL OR length(trim(p_ticket))<8 OR length(p_ticket)>240
 THEN RAISE EXCEPTION 'invalid_legacy_recovery_ticket'; END IF;
 PERFORM 1 FROM cms_delivery_outbox WHERE id=p_event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'legacy_event_missing_from_original_outbox'; END IF;
 SELECT status,event_sha256 INTO prior
 FROM cms_purge_receipts WHERE event_id=p_event_id FOR UPDATE;
 IF NOT FOUND OR prior.status<>'completed' OR prior.event_sha256 IS NOT NULL
 THEN RAISE EXCEPTION 'legacy_receipt_not_eligible_for_redrive'; END IF;
 INSERT INTO cms_legacy_receipt_recovery_audit
 (event_id,event_sha256,operator_id,ticket_ref,original_status,outcome)
 VALUES(p_event_id,p_digest,trim(p_actor),trim(p_ticket),'completed','replay_enqueued');
 DELETE FROM cms_purge_receipts
 WHERE event_id=p_event_id AND status='completed' AND event_sha256 IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'legacy_receipt_reset_race'; END IF;
 RETURN TRUE;
END $fn$;
REVOKE ALL ON cms_legacy_receipt_recovery_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION cms_claim_legacy_redrive(uuid,varchar,varchar,varchar) FROM PUBLIC;
COMMIT;
