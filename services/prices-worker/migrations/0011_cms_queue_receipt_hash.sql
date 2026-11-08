-- TUR013: bind durable Queue receipt identity to the CANONICAL event body.
-- Existing rows remain NULL (legacy); do not infer equivalence/rights.
BEGIN;
ALTER TABLE cms_purge_receipts
 ADD COLUMN event_sha256 varchar(64)
 CONSTRAINT cms_receipt_sha256 CHECK (event_sha256 IS NULL OR event_sha256 ~ '^[a-f0-9]{64}$');
CREATE INDEX cms_purge_receipts_event_digest_idx
 ON cms_purge_receipts(event_id,event_sha256) WHERE event_sha256 IS NOT NULL;
COMMIT;
