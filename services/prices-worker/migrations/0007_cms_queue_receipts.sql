-- TUR008: durable at-least-once Queue receipt with lease and completion token.
-- No live Queue or DLQ is configured by this migration.
BEGIN;
CREATE TABLE cms_purge_receipts (
 event_id uuid PRIMARY KEY,
 status varchar(16) NOT NULL CHECK(status IN ('processing','completed')),
 claim_token uuid NOT NULL,
 lease_until timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 10000),
 completed_at timestamptz,
 CONSTRAINT cms_purge_completed_check CHECK (
   (status='completed' AND completed_at IS NOT NULL)
   OR (status='processing' AND completed_at IS NULL))
);
CREATE INDEX cms_purge_receipts_lease_idx ON cms_purge_receipts(status,lease_until);
COMMIT;
