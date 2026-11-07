/**
 * Price publication rules are pure JS so security checks run in Node tests
 * without a database, Cloudflare account or fake "live" retailer records.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_HOSTNAME = /^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const FUTURE_SKEW_MS = 5 * 60 * 1000;

export function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

/** Exact host matching: never suffix-only checks, HTTP, credentials or ports. */
export function verifiedMerchantUrl(raw, allowedHosts) {
  if (typeof raw !== "string" || raw.length > 2048 ||
      !Array.isArray(allowedHosts) || !allowedHosts.length) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.port || parsed.hash || !SAFE_HOSTNAME.test(host) ||
        !host.includes(".") || host.endsWith(".localhost") ||
        host.endsWith(".invalid") || host.endsWith(".test") ||
        host.endsWith(".example") || host === "localhost") return null;
    if (!allowedHosts.some((item) => typeof item === "string" && item.toLowerCase() === host)) return null;
    if (parsed.pathname.length > 1536) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isFreshObservation(observedAt, now, maxAgeMs = MAX_AGE_MS) {
  const timestamp = new Date(observedAt).getTime();
  const current = new Date(now).getTime();
  return Number.isFinite(timestamp) && Number.isFinite(current) &&
    Number.isSafeInteger(maxAgeMs) && maxAgeMs > 0 && maxAgeMs <= MAX_AGE_MS &&
    timestamp <= current + FUTURE_SKEW_MS && timestamp >= current - maxAgeMs;
}

function isMoneyMinor(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Candidate = {offer, merchant, hosts: string[], observation}.
 * Observations must be the LATEST received snapshot, even if quarantined;
 * an older successful observation cannot override a newer quarantine.
 */
export function publicOffers(candidates, now = new Date()) {
  if (!Array.isArray(candidates)) return [];
  const published = [];
  for (const entry of candidates) {
    const offer = entry?.offer;
    const merchant = entry?.merchant;
    const snapshot = entry?.observation;
    if (!offer || !merchant || !snapshot) continue;
    if (offer.publishingStatus !== "published" || merchant.rightsStatus !== "approved" ||
        !merchant.rightsEvidenceRef || snapshot.verificationStatus !== "verified" ||
        snapshot.stockStatus !== "available" || !snapshot.taxIncluded ||
        !snapshot.evidenceRef || !["authorized_feed", "licensed_manual"].includes(snapshot.collectionMethod)) continue;
    if (offer.market !== "TR" || merchant.market !== "TR" || offer.currency !== "TRY" ||
        !isUuid(offer.deviceVariantId) || !isUuid(offer.id)) continue;
    if (!isMoneyMinor(snapshot.productPriceMinor) || !isMoneyMinor(snapshot.mandatoryShippingMinor)) continue;
    if (!isFreshObservation(snapshot.observedAt, now)) continue;
    const totalPriceMinor = snapshot.productPriceMinor + snapshot.mandatoryShippingMinor;
    if (!Number.isSafeInteger(totalPriceMinor)) continue;
    const purchaseUrl = verifiedMerchantUrl(offer.productUrl, entry.hosts);
    if (!purchaseUrl) continue;
    if (offer.affiliate && merchant.affiliateProgramStatus !== "approved") continue;
    published.push({
      offerId: offer.id,
      deviceVariantId: offer.deviceVariantId,
      merchant: merchant.displayName,
      productPriceMinor: snapshot.productPriceMinor,
      mandatoryShippingMinor: snapshot.mandatoryShippingMinor,
      totalPriceMinor,
      currency: "TRY",
      market: "TR",
      stock: "available",
      observedAt: new Date(snapshot.observedAt).toISOString(),
      purchaseUrl,
      affiliate: offer.affiliate === true
    });
  }
  return published.sort((a, b) =>
    a.totalPriceMinor - b.totalPriceMinor ||
    a.merchant.localeCompare(b.merchant, "tr") ||
    a.offerId.localeCompare(b.offerId));
}
