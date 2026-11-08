-- TUR013: selected version and monotonic generation MUST agree at EVERY
-- database-backed public read. Fail closed for missing/stale fences.
-- CI-only. Review legacy rows and live transactions before production migration.
BEGIN;
CREATE TABLE cms_publication_fences(
 submission_id uuid PRIMARY KEY REFERENCES content_submissions(id),
 active_version integer NOT NULL CHECK(active_version>0),
 generation bigint NOT NULL CHECK(generation>0 AND generation>=active_version),
 state varchar(16) NOT NULL CHECK(state IN ('published','withdrawn')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(submission_id,active_version)
    REFERENCES published_content_versions(submission_id,version)
);
CREATE INDEX cms_publication_fences_state_generation_idx
 ON cms_publication_fences(state,generation);
-- Migration backfill uses latest independently recorded published head, not
-- unapproved draft payload. NO withdrawn content can enter this backfill.
INSERT INTO cms_publication_fences(submission_id,active_version,generation,state)
SELECT s.id,
 COALESCE(h.publication_version,latest.version),
 (SELECT max(o.revision_no) FROM cms_delivery_outbox o WHERE o.submission_id=s.id),'published'
FROM content_submissions s
LEFT JOIN cms_publication_heads h ON h.submission_id=s.id
JOIN LATERAL (
 SELECT max(v.version) AS version FROM published_content_versions v WHERE v.submission_id=s.id
) latest ON true
WHERE s.state='published'
  AND COALESCE(h.publication_version,latest.version) IS NOT NULL
  AND EXISTS (SELECT 1 FROM cms_delivery_outbox o WHERE o.submission_id=s.id);

CREATE OR REPLACE VIEW cms_public_pages WITH (security_barrier=true) AS
SELECT s.id AS submission_id,s.content_type,s.slug,s.updated_at,
 v.public_payload AS content,v.version,
 CASE WHEN m.id IS NOT NULL THEN '/media/cms/' || m.id ELSE NULL END AS "mediaPath",
 f.generation AS "fenceGeneration"
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
JOIN cms_publication_fences f ON f.submission_id=s.id AND f.state='published' AND f.active_version=v.version AND f.generation<=s.revision_no AND f.generation=(SELECT max(o.revision_no) FROM cms_delivery_outbox o WHERE o.submission_id=s.id)
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
