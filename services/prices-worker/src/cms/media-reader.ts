import { neon } from "@neondatabase/serverless";

const ID=/^[a-z0-9][a-z0-9_-]{0,95}$/;
/**
 * Asset is public ONLY if independently licensed and referenced by the most
 * recent immutable public snapshot of a CURRENTLY published article or phone.
 */
export async function readApprovedMediaAsset(databaseUrl:string,assetId:string){
  if(!ID.test(assetId))throw Error("invalid_asset_id");
  const db=neon(databaseUrl);
  const rows=await db`
    SELECT m.id,m.r2_key AS key,m.content_type AS "contentType",
           m.bytes,m.sha256_hex AS "sha256Hex",m.rights_approved AS "rightsApproved"
    FROM cms_media_assets m
    WHERE m.id=${assetId} AND m.rights_approved=true AND EXISTS(
      SELECT 1 FROM content_submissions s
      JOIN LATERAL(
        SELECT v.public_payload FROM published_content_versions v
        WHERE v.submission_id=s.id ORDER BY v.version DESC LIMIT 1
      ) v ON true
      WHERE s.state='published' AND v.public_payload->>'coverMediaId'=m.id
    ) LIMIT 1`;
  return rows[0]??null;
}
