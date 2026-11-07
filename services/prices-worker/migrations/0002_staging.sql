-- TUR005: append-only staging; does NOT publish price offers.
BEGIN;
CREATE TABLE source_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id),
  collection_method varchar(24) NOT NULL
    CHECK (collection_method IN ('authorized_feed', 'licensed_manual')),
  rights_evidence_ref text NOT NULL CHECK (length(trim(rights_evidence_ref)) > 0),
  source_batch_key varchar(160) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','quarantined','reviewed','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, source_batch_key)
);
CREATE TABLE staged_price_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES source_import_batches(id),
  external_offer_id varchar(120) NOT NULL,
  payload jsonb NOT NULL,
  validation_status varchar(24) NOT NULL
    CHECK (validation_status IN ('pending_review','quarantined')),
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, external_offer_id),
  CONSTRAINT staged_price_records_reasons_array CHECK (jsonb_typeof(rejection_reasons) = 'array'),
  CONSTRAINT staged_price_records_payload_object CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX staged_price_records_status_idx ON staged_price_records (validation_status, received_at);
COMMIT;
