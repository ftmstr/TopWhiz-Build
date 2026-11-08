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

CREATE TABLE cms_rights_revocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_type varchar(8) NOT NULL CHECK (asset_type IN ('source','media')),
 asset_id varchar(160) NOT NULL,
 reason_ref text NOT NULL CHECK(length(trim(reason_ref))>=8),
 actor varchar(120) NOT NULL CHECK(length(trim(actor))>=3),
 affected_count integer NOT NULL CHECK(affected_count>=0),
 revoked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cms_rights_revocations_idx ON cms_rights_revocations(asset_type,asset_id,revoked_at);

-- Binds source and media rights to the ACTUAL latest PUBLIC version,
-- independent of unapproved/current private draft payload.
CREATE TABLE cms_public_dependencies (
  submission_id uuid NOT NULL REFERENCES content_submissions(id),
  version integer NOT NULL CHECK(version>0),
  resource_kind varchar(8) NOT NULL CHECK(resource_kind IN ('source','media')),
  resource_id varchar(160) NOT NULL,
  PRIMARY KEY(submission_id,version,resource_kind,resource_id)
);
CREATE INDEX cms_public_dependencies_resource_idx
 ON cms_public_dependencies(resource_kind,resource_id,submission_id);

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
 AND (v.public_payload->>'coverMediaId' IS NULL OR m.id IS NOT NULL);

CREATE VIEW cms_public_media WITH (security_barrier=true) AS
SELECT m.id,m.r2_key AS key,m.content_type AS "contentType",
 m.bytes,m.sha256_hex AS "sha256Hex",m.rights_approved AS "rightsApproved"
FROM cms_media_assets m
WHERE m.rights_approved=true AND EXISTS (
 SELECT 1 FROM cms_public_pages p WHERE p.content->>'coverMediaId'=m.id
);
COMMIT;
