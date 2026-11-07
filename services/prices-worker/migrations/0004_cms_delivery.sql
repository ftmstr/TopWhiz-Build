-- TUR006 PostgreSQL CMS delivery. REVIEW / CI ONLY; never run on production automatically.
BEGIN;

ALTER TABLE content_submissions
  ADD COLUMN revision_no integer NOT NULL DEFAULT 1
    CONSTRAINT content_submissions_revision_positive CHECK (revision_no > 0);

-- Reviewer-managed evidence. In deployment grant separate least-privilege DB roles:
-- intake has no rights to insert/update evidence or review grants.
CREATE TABLE cms_trusted_sources (
  id varchar(160) PRIMARY KEY,
  source_type varchar(24) NOT NULL
    CHECK (source_type IN ('manufacturer','official','licensed_editorial')),
  rights_ref text NOT NULL CHECK (length(trim(rights_ref)) >= 6),
  rights_approved boolean NOT NULL DEFAULT false,
  reviewed_by varchar(120) NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cms_media_assets (
  id varchar(160) PRIMARY KEY,
  r2_key text NOT NULL UNIQUE,
  content_type varchar(40) NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 10485760),
  sha256_hex varchar(64) NOT NULL CHECK (sha256_hex ~ '^[a-f0-9]{64}$'),
  alt_text varchar(400) NOT NULL CHECK (length(trim(alt_text)) > 0),
  license_evidence_ref text NOT NULL CHECK (length(trim(license_evidence_ref)) >= 6),
  rights_approved boolean NOT NULL DEFAULT false,
  reviewed_by varchar(120) NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cms_review_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES content_submissions(id),
  revision_no integer NOT NULL CHECK (revision_no > 0),
  approved boolean NOT NULL DEFAULT false,
  editorial_verified boolean NOT NULL DEFAULT false,
  originality_verified boolean NOT NULL DEFAULT false,
  specifications_verified boolean NOT NULL DEFAULT false,
  verified_by varchar(120) NOT NULL CHECK (length(trim(verified_by)) > 2),
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, revision_no)
);

-- Durable transaction outbox, required even when cache/queue is down.
CREATE TABLE cms_delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES content_submissions(id),
  revision_no integer NOT NULL CHECK (revision_no > 0),
  event_kind varchar(24) NOT NULL CHECK (event_kind IN ('published','withdrawn')),
  routes jsonb NOT NULL CHECK (jsonb_typeof(routes) = 'array'),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (submission_id, revision_no, event_kind)
);
CREATE INDEX cms_delivery_pending_idx ON cms_delivery_outbox (status, created_at);

-- Disallow identical detail page slugs mapped to separate content rows, yet
-- allow shared index and home page bindings.
CREATE UNIQUE INDEX published_route_detail_unique_idx
  ON published_route_bindings (public_path)
  WHERE public_path LIKE '/haberler/%' OR public_path LIKE '/telefonlar/%';

COMMIT;
