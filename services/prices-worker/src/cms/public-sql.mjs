/**
 * Public queries access security-barrier projections only. Database reader
 * role has no SELECT permission on raw submissions or rights evidence.
 */
export const publicCmsListSql=String.raw`SELECT content,version,"mediaPath"
 FROM cms_public_pages WHERE content_type=$1
 ORDER BY updated_at DESC,submission_id DESC LIMIT 50`;
export const publicCmsDetailSql=String.raw`SELECT content,version,"mediaPath"
 FROM cms_public_pages WHERE content_type=$1 AND slug=$2 LIMIT 1`;
export const publicMediaAssetSql=String.raw`SELECT id,key,"contentType",bytes,"sha256Hex","rightsApproved"
 FROM cms_public_media WHERE id=$1 LIMIT 1`;
