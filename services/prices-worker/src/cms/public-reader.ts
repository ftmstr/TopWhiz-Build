import { neon } from "@neondatabase/serverless";

export type CmsType = "news"|"phone";
const types=new Set(["news","phone"]);
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Public reader sees only immutable approved versions, never draft payloads. */
export async function readPublishedCms(databaseUrl:string,type:CmsType,slug?:string){
  if(!types.has(type))throw Error("invalid_type");
  if(slug!==undefined && (slug.length>100||!slugPattern.test(slug)))throw Error("invalid_slug");
  const db=neon(databaseUrl);
  if(slug!==undefined){
    const rows=await db`
      SELECT v.public_payload AS content,v.version,
        CASE WHEN m.id IS NOT NULL THEN '/media/cms/' || m.id ELSE NULL END AS "mediaPath"
      FROM content_submissions s
      JOIN LATERAL (
        SELECT public_payload,version FROM published_content_versions
        WHERE submission_id=s.id ORDER BY version DESC LIMIT 1
      ) v ON TRUE
      LEFT JOIN cms_media_assets m ON m.id=v.public_payload->>'coverMediaId'
        AND m.rights_approved=true
      WHERE s.state='published' AND s.content_type=${type} AND s.slug=${slug}
      LIMIT 1`;
    return rows[0]??null;
  }
  const rows=await db`
    SELECT v.public_payload AS content,v.version,
        CASE WHEN m.id IS NOT NULL THEN '/media/cms/' || m.id ELSE NULL END AS "mediaPath"
    FROM content_submissions s
    JOIN LATERAL (
      SELECT public_payload,version FROM published_content_versions
      WHERE submission_id=s.id ORDER BY version DESC LIMIT 1
    ) v ON TRUE
    LEFT JOIN cms_media_assets m ON m.id=v.public_payload->>'coverMediaId'
      AND m.rights_approved=true
    WHERE s.state='published' AND s.content_type=${type}
    ORDER BY s.updated_at DESC,s.id DESC LIMIT 50`;
  return rows;
}
