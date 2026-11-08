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
REVOKE ALL ON cms_legacy_receipt_recovery_audit FROM PUBLIC;
COMMIT;
