-- TOPWHIZ TUR004: PostgreSQL schema, REVIEW ONLY. Do not auto-apply.
-- Hand-authored initial migration synchronized with src/db/schema.ts.
-- No real merchants or device entries are seeded.
BEGIN;

CREATE TABLE device_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand varchar(100) NOT NULL,
  model_code varchar(150) NOT NULL,
  market varchar(2) NOT NULL,
  ram_gb integer NOT NULL CHECK (ram_gb >= 0),
  storage_gb integer NOT NULL CHECK (storage_gb > 0),
  color_code varchar(100) NOT NULL,
  item_condition varchar(24) NOT NULL CHECK (item_condition IN ('new', 'refurbished', 'used')),
  warranty_class varchar(48) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_variants_market_chk CHECK (market = 'TR')
);
CREATE UNIQUE INDEX device_variants_identity_idx ON device_variants
  (brand, model_code, market, ram_gb, storage_gb, color_code, item_condition, warranty_class);

CREATE TABLE merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name varchar(160) NOT NULL,
  market varchar(2) NOT NULL CHECK (market = 'TR'),
  rights_status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (rights_status IN ('pending', 'approved', 'blocked')),
  rights_evidence_ref text,
  affiliate_program_status varchar(24) NOT NULL DEFAULT 'none'
    CHECK (affiliate_program_status IN ('none', 'pending', 'approved', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT merchants_rights_evidence_chk CHECK
    (rights_status <> 'approved' OR (rights_evidence_ref IS NOT NULL AND length(trim(rights_evidence_ref)) > 0))
);

CREATE TABLE merchant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id),
  hostname varchar(253) NOT NULL,
  verification_status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verification_evidence_ref text,
  verified_at timestamptz,
  CONSTRAINT merchant_domains_verified_evidence_chk CHECK (
    verification_status <> 'verified' OR
    (verified_at IS NOT NULL AND verification_evidence_ref IS NOT NULL
      AND length(trim(verification_evidence_ref)) > 0)
  ),
  CONSTRAINT merchant_domains_lowercase_chk CHECK (hostname = lower(hostname)),
  CONSTRAINT merchant_domains_host_no_scheme_chk CHECK (
    hostname NOT LIKE '%/%' AND hostname NOT LIKE '%:%' AND hostname NOT LIKE '%@%'
  )
);
CREATE UNIQUE INDEX merchant_domains_unique_idx ON merchant_domains (merchant_id, hostname);
CREATE INDEX merchant_domains_status_idx ON merchant_domains (merchant_id, verification_status);

CREATE TABLE merchant_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id),
  device_variant_id uuid NOT NULL REFERENCES device_variants(id),
  merchant_sku varchar(160) NOT NULL,
  product_url text NOT NULL CHECK (product_url LIKE 'https://%'),
  currency varchar(3) NOT NULL CHECK (currency = 'TRY'),
  market varchar(2) NOT NULL CHECK (market = 'TR'),
  publishing_status varchar(24) NOT NULL DEFAULT 'draft'
    CHECK (publishing_status IN ('draft', 'review', 'published', 'withdrawn', 'quarantined')),
  affiliate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX merchant_offers_sku_unique_idx ON merchant_offers (merchant_id, merchant_sku);
CREATE INDEX merchant_offers_variant_status_idx ON merchant_offers (device_variant_id, publishing_status);

CREATE TABLE price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES merchant_offers(id),
  product_price_minor integer NOT NULL CHECK (product_price_minor >= 0),
  mandatory_shipping_minor integer CHECK (mandatory_shipping_minor >= 0),
  tax_included boolean NOT NULL,
  stock_status varchar(24) NOT NULL CHECK (stock_status IN ('available', 'out_of_stock', 'unknown')),
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0),
  collection_method varchar(24) NOT NULL
    CHECK (collection_method IN ('authorized_feed', 'licensed_manual')),
  verification_status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'quarantined')),
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_observations_offer_observed_idx ON price_observations (offer_id, observed_at);

COMMIT;
