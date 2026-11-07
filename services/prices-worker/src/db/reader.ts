import { neon } from "@neondatabase/serverless";
import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { merchantDomains, merchantOffers, merchants, priceObservations } from "./schema";
import { publicOffers } from "../policy.mjs";

const MAX_OFFERS = 100;
const MAX_DOMAINS = 500;
const MAX_OBSERVATIONS = 2000;

/**
 * Read-only, fail-closed projection. No write endpoints are exposed.
 * Ingestion and review are separate, authenticated future workflows.
 */
export async function readPublicPrices(databaseUrl: string, deviceVariantId: string, now: Date) {
  const db = drizzle(neon(databaseUrl));
  const offers = await db.select({
    offerId: merchantOffers.id,
    deviceVariantId: merchantOffers.deviceVariantId,
    productUrl: merchantOffers.productUrl,
    publishingStatus: merchantOffers.publishingStatus,
    currency: merchantOffers.currency,
    market: merchantOffers.market,
    affiliate: merchantOffers.affiliate,
    merchantId: merchants.id,
    merchantName: merchants.displayName,
    merchantMarket: merchants.market,
    merchantRightsStatus: merchants.rightsStatus,
    merchantRightsEvidence: merchants.rightsEvidenceRef,
    merchantAffiliateStatus: merchants.affiliateProgramStatus
  }).from(merchantOffers)
    .innerJoin(merchants, eq(merchantOffers.merchantId, merchants.id))
    .where(and(
      eq(merchantOffers.deviceVariantId, deviceVariantId),
      eq(merchantOffers.publishingStatus, "published"),
      eq(merchants.rightsStatus, "approved")
    ))
    .limit(MAX_OFFERS + 1);

  if (!offers.length) return [];
  if (offers.length > MAX_OFFERS) throw new Error("offer_limit_exceeded");

  const offerIds = offers.map((offer) => offer.offerId);
  const merchantIds = [...new Set(offers.map((offer) => offer.merchantId))];
  const [domainRows, observationRows] = await Promise.all([
    db.select({ merchantId: merchantDomains.merchantId, hostname: merchantDomains.hostname })
      .from(merchantDomains)
      .where(and(inArray(merchantDomains.merchantId, merchantIds), eq(merchantDomains.verificationStatus, "verified")))
      .limit(MAX_DOMAINS + 1),
    db.select({
      offerId: priceObservations.offerId,
      productPriceMinor: priceObservations.productPriceMinor,
      mandatoryShippingMinor: priceObservations.mandatoryShippingMinor,
      taxIncluded: priceObservations.taxIncluded,
      stockStatus: priceObservations.stockStatus,
      evidenceRef: priceObservations.evidenceRef,
      collectionMethod: priceObservations.collectionMethod,
      verificationStatus: priceObservations.verificationStatus,
      observedAt: priceObservations.observedAt
    }).from(priceObservations)
      .where(inArray(priceObservations.offerId, offerIds))
      .orderBy(desc(priceObservations.receivedAt), desc(priceObservations.observedAt))
      .limit(MAX_OBSERVATIONS + 1)
  ]);
  if (domainRows.length > MAX_DOMAINS || observationRows.length > MAX_OBSERVATIONS) {
    throw new Error("result_limit_exceeded");
  }

  const hostsByMerchant = new Map<string, string[]>();
  for (const domain of domainRows) {
    const hosts = hostsByMerchant.get(domain.merchantId) ?? [];
    hosts.push(domain.hostname);
    hostsByMerchant.set(domain.merchantId, hosts);
  }

  // First row is newest received record. A later rejection suppresses the offer.
  const latestByOffer = new Map<string, (typeof observationRows)[number]>();
  for (const snapshot of observationRows) {
    if (!latestByOffer.has(snapshot.offerId)) latestByOffer.set(snapshot.offerId, snapshot);
  }

  return publicOffers(offers.map((row) => ({
    offer: {
      id: row.offerId,
      deviceVariantId: row.deviceVariantId,
      productUrl: row.productUrl,
      publishingStatus: row.publishingStatus,
      currency: row.currency,
      market: row.market,
      affiliate: row.affiliate
    },
    merchant: {
      displayName: row.merchantName,
      market: row.merchantMarket,
      rightsStatus: row.merchantRightsStatus,
      rightsEvidenceRef: row.merchantRightsEvidence,
      affiliateProgramStatus: row.merchantAffiliateStatus
    },
    hosts: hostsByMerchant.get(row.merchantId) ?? [],
    observation: latestByOffer.get(row.offerId) ?? null
  })), now);
}
