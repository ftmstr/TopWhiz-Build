-- TUR007 trusted automatic publication gate. Applied to ephemeral CI only.
-- Content submitters MUST NOT have INSERT/UPDATE privileges on either table.
BEGIN;
CREATE TABLE cms_review_authorities (
  id varchar(120) PRIMARY KEY,
  active boolean NOT NULL DEFAULT false,
  reviewer_class varchar(24) NOT NULL CHECK (reviewer_class IN ('human','licensed_verifier')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cms_external_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES content_submissions(id),
  revision_no integer NOT NULL CHECK (revision_no>0),
  attestation_type varchar(24) NOT NULL CHECK (
    attestation_type IN ('editorial','originality','specifications')),
  authority_id varchar(120) NOT NULL REFERENCES cms_review_authorities(id),
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref))>=8),
  status varchar(24) NOT NULL CHECK (status IN ('verified','rejected','revoked')),
  credited_author varchar(120) NOT NULL CHECK(length(trim(credited_author))>=3),
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id,revision_no,attestation_type)
);
CREATE INDEX cms_external_attestations_review_idx
  ON cms_external_attestations(submission_id,revision_no,status);
COMMIT;
