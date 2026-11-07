/**
 * Fail-closed normalization of permitted feed rows.
 * Never promotes rows into public merchant_offers or price_observations.
 * Review and rights decisions are separate privileged operations.
 */
import { isFreshObservation, isUuid, verifiedMerchantUrl } from "../policy.mjs";

const safeInteger = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const allowedStocks = new Set(["available", "out_of_stock", "unknown"]);
const allowedMethods = new Set(["authorized_feed", "licensed_manual"]);

export function validateStagingRow(input, context, now = new Date()) {
  const reasons = [];
  if (!context || !isUuid(context.merchantId)) reasons.push("invalid_merchant");
  if (!context || !allowedMethods.has(context.collectionMethod)) reasons.push("unauthorized_collection_method");
  if (context?.rightsStatus !== "approved" ||
      typeof context.rightsEvidenceRef !== "string" || !context.rightsEvidenceRef.trim()) {
    reasons.push("rights_not_approved");
  }
  if (!input || !isUuid(input.deviceVariantId)) reasons.push("invalid_device_variant");
  if (!input || typeof input.externalOfferId !== "string" ||
      !/^[A-Za-z0-9._:-]{1,120}$/.test(input.externalOfferId)) reasons.push("invalid_external_offer_id");
  if (input?.currency !== "TRY" || input?.market !== "TR") reasons.push("invalid_market_currency");
  if (!safeInteger(input?.productPriceMinor) || input.productPriceMinor === 0 ||
      !safeInteger(input?.mandatoryShippingMinor) ||
      input.productPriceMinor + input.mandatoryShippingMinor > 2147483647) reasons.push("invalid_total_price");
  if (input?.taxIncluded !== true) reasons.push("tax_unknown");
  if (!allowedStocks.has(input?.stockStatus)) reasons.push("invalid_stock");
  if (input?.stockStatus !== "available") reasons.push("unavailable_stock");
  if (!isFreshObservation(input?.observedAt, now)) reasons.push("stale_or_future_observation");
  if (!verifiedMerchantUrl(input?.productUrl, context?.verifiedHosts)) reasons.push("unverified_merchant_url");
  if (!input || typeof input.sourceRecordRef !== "string" ||
      input.sourceRecordRef.trim().length < 6 || input.sourceRecordRef.length > 500) reasons.push("missing_source_reference");
  const status = reasons.length === 0 ? "pending_review" : "quarantined";
  return { status, reasons };
}

/** No path auto-promotes a staged record; explicit review is always required. */
export function validateStagingBatch(rows, context, now = new Date()) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 200) {
    throw new Error("invalid_batch_size");
  }
  const seen = new Set();
  return rows.map((row) => {
    const outcome = validateStagingRow(row, context, now);
    if (seen.has(row?.externalOfferId)) {
      return { ...outcome, status: "quarantined", reasons: [...outcome.reasons, "duplicate_external_offer_id"] };
    }
    seen.add(row?.externalOfferId);
    return outcome;
  });
}
