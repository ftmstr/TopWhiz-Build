/**
 * Identical parameterized SQL is executed by Neon HTTP (Cloudflare Worker)
 * and node-postgres (ephemeral PostgreSQL 16 integration tests).
 * No dynamic identifiers, user-controlled SQL, drafts or staging rows.
 */
const selected=String.raw`SELECT v.public_payload AS content, v.version,
CASE WHEN m.rights_approved THEN '/media/cms/' || m.id ELSE NULL END AS "mediaPath"
FROM content_submissions s
JOIN LATERAL (
 SELECT public_payload,version FROM published_content_versions
 WHERE submission_id=s.id ORDER BY version DESC LIMIT 1
) v ON TRUE
LEFT JOIN cms_media_assets m ON m.id=v.public_payload->>'coverMediaId' AND m.rights_approved=true
WHERE s.state='published' AND s.content_type=$1`;
export const publicCmsListSql=selected+" ORDER BY s.updated_at DESC,s.id DESC LIMIT 50";
export const publicCmsDetailSql=selected+" AND s.slug=$2 LIMIT 1";
export const publicMediaAssetSql=String.raw`SELECT m.id,m.r2_key AS key,m.content_type AS "contentType",
  m.bytes,m.sha256_hex AS "sha256Hex",m.rights_approved AS "rightsApproved"
FROM cms_media_assets m
WHERE m.id=$1 AND m.rights_approved=true AND EXISTS (
 SELECT 1 FROM content_submissions s
 JOIN LATERAL (
   SELECT v.public_payload FROM published_content_versions v
   WHERE v.submission_id=s.id ORDER BY v.version DESC LIMIT 1
 ) v ON TRUE
 WHERE s.state='published' AND v.public_payload->>'coverMediaId'=m.id
) LIMIT 1`;
