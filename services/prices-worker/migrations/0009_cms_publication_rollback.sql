-- TUR012: operator-supervised publication VERSION rollback; CI-only
-- Existing public URLs and security barriers are preserved. Missing head rows
-- fall back to the latest version for safe upgrade of existing data.
-- This migration DOES NOT itself reactivate withdrawn data or restore licenses.
BEGIN;
CREATE TABLE cms_publication_heads(
 submission_id uuid PRIMARY KEY REFERENCES content_submissions(id),
 publication_version integer NOT NULL CHECK(publication_version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (submission_id,publication_version)
   REFERENCES published_content_versions(submission_id,version)
);
CREATE TABLE cms_publication_rollback_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES content_submissions(id),
 from_version integer NOT NULL CHECK(from_version>0),
 to_version integer NOT NULL CHECK(to_version>0 AND to_version<>from_version),
 resulting_revision integer NOT NULL CHECK(resulting_revision>0),
 reason_ref text NOT NULL CHECK(length(trim(reason_ref))>=8),
 actor varchar(120) NOT NULL CHECK(length(trim(actor))>=3),
 rollback_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(submission_id,resulting_revision)
);
CREATE INDEX cms_publication_rollback_audit_record_idx
 ON cms_publication_rollback_audit(submission_id,rollback_at);

CREATE OR REPLACE VIEW cms_public_pages WITH (security_barrier=true) AS
SELECT s.id AS submission_id,s.content_type,s.slug,s.updated_at,
 v.public_payload AS content,v.version,
 CASE WHEN m.id IS NOT NULL THEN '/media/cms/' || m.id ELSE NULL END AS "mediaPath"
FROM content_submissions s
JOIN LATERAL (
 SELECT p.public_payload,p.version
 FROM published_content_versions p
 WHERE p.submission_id=s.id
   AND p.version=COALESCE(
     (SELECT h.publication_version FROM cms_publication_heads h
      WHERE h.submission_id=s.id),
     (SELECT max(old.version) FROM published_content_versions old
      WHERE old.submission_id=s.id)
   )
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
