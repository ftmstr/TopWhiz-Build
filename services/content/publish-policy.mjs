/**
 * Unified schema-driven page placement for automated content ingestion.
 * There is NO direct publication side effect; publisher must receive
 * server-attested rights, source and media approvals, never model claims.
 */
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedTypes = new Set(["news", "phone"]);
const allowedSourceTypes = new Set(["manufacturer", "official", "licensed_editorial"]);
const allowedLanguages = new Set(["tr", "en"]);

function isSafeText(value, min, max) {
  return typeof value === "string" && value.trim().length >= min &&
    value.trim().length <= max && !/[<>]/.test(value);
}
export function contentDestinations(content) {
  if (!content || !allowedTypes.has(content.type) ||
      !slugPattern.test(content.slug ?? "")) return [];
  if (content.type === "news") {
    return ["/haberler/"+content.slug, "/haberler", "/"];
  }
  return ["/telefonlar/"+content.slug, "/telefonlar", "/karsilastir"];
}

export function assessPublishableContent(content, trustedContext, now = new Date()) {
  const failures = [];
  if (!content || !allowedTypes.has(content.type)) failures.push("invalid_content_type");
  if (!content || typeof content.slug !== "string" ||
      content.slug.length > 100 || !slugPattern.test(content.slug)) failures.push("invalid_slug");
  if (!isSafeText(content?.title, 12, 180)) failures.push("invalid_title");
  if (!isSafeText(content?.summary, 35, 400)) failures.push("invalid_summary");
  if (!allowedLanguages.has(content?.language)) failures.push("invalid_language");

  // Sources and media are independently attested server-side.
  if (!trustedContext || trustedContext.sourceRightsApproved !== true ||
      !isSafeText(trustedContext.sourceRightsRef, 6, 240)) failures.push("source_rights_missing");
  if (!trustedContext || trustedContext.editorialVerification !== "verified") failures.push("editorial_not_verified");
  if (!Array.isArray(content?.sources) || content.sources.length === 0 ||
      content.sources.length > 20 ||
      content.sources.some(source =>
        typeof source !== "string" || !trustedContext?.approvedSourceIds?.includes(source))) {
    failures.push("unverified_sources");
  }
  if (content?.coverMediaId != null && (
      typeof content.coverMediaId !== "string" ||
      !trustedContext?.approvedMediaIds?.includes(content.coverMediaId))) {
    failures.push("media_rights_missing");
  }
  const publishedAt = Date.parse(content?.observedAt ?? "");
  const clock = new Date(now).getTime();
  if (!Number.isFinite(publishedAt) || publishedAt > clock + 5*60*1000 ||
      publishedAt < clock - 90*24*3600*1000) failures.push("invalid_observation_date");
  if (content?.type === "news") {
    if (!isSafeText(content.body, 140, 30000)) failures.push("missing_original_body");
    if (trustedContext?.originalityChecked !== true) failures.push("originality_not_checked");
    if (!allowedSourceTypes.has(trustedContext?.sourceType)) failures.push("unsupported_source_type");
  }
  if (content?.type === "phone") {
    if (!isSafeText(content.brand, 2, 90) || !isSafeText(content.modelCode, 2, 120) ||
        !isSafeText(content.market, 2, 2)) failures.push("invalid_phone_identity");
    if (!Array.isArray(content.variants) || content.variants.length === 0 ||
        content.variants.length > 30) failures.push("missing_phone_variants");
    else if (content.variants.some(v => !v || !Number.isInteger(v.storageGb) ||
        v.storageGb <= 0 || !Number.isInteger(v.ramGb) || v.ramGb < 0 ||
        !isSafeText(v.warrantyClass, 2, 50))) failures.push("invalid_phone_variants");
    if (!trustedContext?.specificationsVerified) failures.push("specifications_not_verified");
  }
  return {
    status: failures.length ? "quarantined" : "ready_for_auto_publish",
    failures,
    destinations: failures.length ? [] : contentDestinations(content)
  };
}
