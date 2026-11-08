-- TUR009 migration: issuer authority revocation affects published snapshots.
-- Only ephemeral CI database; operator review required before any real migration.
BEGIN;
CREATE TABLE cms_public_issuer_dependencies (
  submission_id uuid NOT NULL REFERENCES content_submissions(id),
  version integer NOT NULL CHECK(version>0),
  attestation_type varchar(24) NOT NULL
    CHECK(attestation_type IN ('editorial','originality','specifications')),
  authority_id varchar(120) NOT NULL REFERENCES cms_review_authorities(id),
  approved_public_key text NOT NULL,
  approved_signature_base64 text NOT NULL,
  PRIMARY KEY(submission_id,version,attestation_type)
);
CREATE INDEX cms_public_issuer_authority_idx
 ON cms_public_issuer_dependencies(authority_id,submission_id,version);

CREATE TABLE cms_issuer_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id varchar(120) NOT NULL REFERENCES cms_review_authorities(id),
  reason_ref text NOT NULL CHECK(length(trim(reason_ref))>=8),
  verification_actor varchar(120) NOT NULL CHECK(length(trim(verification_actor))>=3),
  affected_count integer NOT NULL DEFAULT 0 CHECK(affected_count>=0),
  revoked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cms_issuer_revocations_authority_idx
 ON cms_issuer_revocations(authority_id,revoked_at);

-- Replaces the TUR008 view with issuer-status/attestation/key checks as
-- separate independent requirements. Even before reconciler runs, a revoked
-- issuer, changed public key, or revoked signed evidence denies public access.
CREATE OR REPLACE VIEW cms_public_pages WITH (security_barrier=true) AS
SELECT s.id AS submission_id,s.content_type,s.slug,s.updated_at,
 v.public_payload AS content,v.version,
 CASE WHEN m.id IS NOT NULL THEN '/media/cms/' || m.id ELSE NULL END AS "mediaPath"
FROM content_submissions s
JOIN LATERAL (
 SELECT p.public_payload,p.version
 FROM published_content_versions p
 WHERE p.submission_id=s.id ORDER BY p.version DESC LIMIT 1
) v ON true
LEFT JOIN cms_media_assets m ON m.id=v.public_payload->>'coverMediaId'
 AND m.rights_approved=true
WHERE s.state='published'
 AND EXISTS (
   SELECT 1 FROM cms_public_dependencies d
   WHERE d.submission_id=s.id AND d.version=v.version
     AND d.resource_kind='source'
 )
 AND NOT EXISTS (
   SELECT 1 FROM cms_public_dependencies d
   LEFT JOIN cms_trusted_sources src ON d.resource_kind='source'
     AND src.id=d.resource_id
   LEFT JOIN cms_media_assets media ON d.resource_kind='media'
     AND media.id=d.resource_id
   WHERE d.submission_id=s.id AND d.version=v.version
     AND (
       (d.resource_kind='source' AND src.rights_approved IS DISTINCT FROM true)
       OR (d.resource_kind='media' AND media.rights_approved IS DISTINCT FROM true)
     )
 )
 AND (v.public_payload->>'coverMediaId' IS NULL OR m.id IS NOT NULL)
 -- Auto-reviewed publications MUST have a version-scoped issuer reference.
 AND NOT EXISTS (
  SELECT 1 FROM cms_review_grants grant_row
  WHERE grant_row.submission_id=s.id AND grant_row.revision_no=v.version
    AND grant_row.verified_by LIKE 'auto-gate:%'
    AND NOT EXISTS (
      SELECT 1 FROM cms_public_issuer_dependencies ref
      WHERE ref.submission_id=s.id AND ref.version=v.version
    )
 )
 AND NOT EXISTS (
  SELECT 1 FROM cms_public_issuer_dependencies ref
  LEFT JOIN cms_review_authorities issuer ON issuer.id=ref.authority_id
  LEFT JOIN cms_external_attestations att
    ON att.submission_id=ref.submission_id AND att.revision_no=ref.version
    AND att.attestation_type=ref.attestation_type
    AND att.authority_id=ref.authority_id
  WHERE ref.submission_id=s.id AND ref.version=v.version
    AND (issuer.active IS DISTINCT FROM true OR
         issuer.public_key_pem IS DISTINCT FROM ref.approved_public_key OR
         att.status IS DISTINCT FROM 'verified' OR
         att.signature_base64 IS DISTINCT FROM ref.approved_signature_base64)
 );
COMMIT;
