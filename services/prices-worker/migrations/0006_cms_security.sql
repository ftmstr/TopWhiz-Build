-- TUR008: CI/test-only migration. Require explicit human review before production use.
BEGIN;
-- Signature is bound to independent issuer identity, submission revision, exact
-- evidence and timestamp; empty/unsigned historical attestations fail closed.
ALTER TABLE cms_review_authorities ADD COLUMN public_key_pem text;
ALTER TABLE cms_external_attestations ADD COLUMN signature_base64 text;
ALTER TABLE cms_review_authorities ADD CONSTRAINT cms_issuer_key_required CHECK
  (active=false OR (public_key_pem IS NOT NULL AND length(public_key_pem)>=70));
ALTER TABLE cms_external_attestations ADD CONSTRAINT cms_attestation_signature_required CHECK
  (status<>'verified' OR (signature_base64 IS NOT NULL AND length(signature_base64)>=80));

-- A currently public page is projected via an owner's security-barrier view:
-- public DB role receives SELECT on the view, NOT access to drafts/review tables.
CREATE VIEW cms_public_pages WITH (security_barrier=true) AS
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
WHERE s.state='published';

CREATE VIEW cms_public_media WITH (security_barrier=true) AS
SELECT m.id,m.r2_key AS key,m.content_type AS "contentType",
 m.bytes,m.sha256_hex AS "sha256Hex",m.rights_approved AS "rightsApproved"
FROM cms_media_assets m
WHERE m.rights_approved=true AND EXISTS (
 SELECT 1 FROM cms_public_pages p WHERE p.content->>'coverMediaId'=m.id
);
COMMIT;
