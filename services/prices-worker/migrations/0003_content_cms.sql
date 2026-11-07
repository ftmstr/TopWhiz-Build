-- TUR005 proposed CMS storage; no automatic migration or production publish.
BEGIN;
CREATE TABLE content_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_key varchar(160) NOT NULL UNIQUE,
  content_type varchar(16) NOT NULL CHECK (content_type IN ('news','phone')),
  slug varchar(100) NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  state varchar(24) NOT NULL DEFAULT 'quarantined'
    CHECK (state IN ('quarantined','pending_review','approved','published','withdrawn')),
  quarantine_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(quarantine_reasons) = 'array'),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, slug)
);
CREATE TABLE content_rights_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES content_submissions(id),
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0),
  evidence_type varchar(24) NOT NULL CHECK (evidence_type IN ('source','originality','image','device_spec')),
  verification_actor varchar(120) NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE published_content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES content_submissions(id),
  version integer NOT NULL CHECK (version > 0),
  public_payload jsonb NOT NULL CHECK (jsonb_typeof(public_payload) = 'object'),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, version)
);
-- Site route generation is controlled by the server; no arbitrary redirect.
CREATE TABLE published_route_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES content_submissions(id),
  public_path varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (public_path, submission_id)
);
COMMIT;
