/**
 * Authorized staging only. No public Worker import; no promotion methods.
 * Import user DB role should have SELECT on merchant/domain, INSERT on
 * staging tables, and no write access to published price tables.
 */
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { merchants, merchantDomains, sourceImportBatches, stagedPriceRecords } from "../db/schema";
import { validateStagingBatch } from "./validate.mjs";

export type ImportedRow = {
  externalOfferId: string;
  deviceVariantId?: string;
  productUrl?: string;
  productPriceMinor?: number;
  mandatoryShippingMinor?: number;
  currency?: string;
  market?: string;
  taxIncluded?: boolean;
  stockStatus?: string;
  observedAt?: string;
  sourceRecordRef?: string;
};
export type IngestionBatch = {
  sourceBatchKey: string;
  merchantId: string;
  collectionMethod: "authorized_feed" | "licensed_manual";
  rows: ImportedRow[];
};

export async function stageFeedBatch(db: NodePgDatabase, batch: IngestionBatch, now = new Date()) {
  if (!batch || typeof batch.sourceBatchKey !== "string" ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(batch.sourceBatchKey)) throw new Error("invalid_batch_key");
  if (!batch.merchantId || !batch.rows) throw new Error("invalid_batch");
  // Never trust a feed's claimed rights or merchant allowed domains.
  const [merchant] = await db.select({
    id: merchants.id,
    rightsStatus: merchants.rightsStatus,
    rightsEvidenceRef: merchants.rightsEvidenceRef
  }).from(merchants).where(eq(merchants.id, batch.merchantId)).limit(1);
  if (!merchant) throw new Error("merchant_not_found");
  const approvedDomains = await db.select({ hostname: merchantDomains.hostname })
    .from(merchantDomains)
    .where(and(eq(merchantDomains.merchantId, batch.merchantId),
      eq(merchantDomains.verificationStatus, "verified")))
    .limit(501);
  if (approvedDomains.length > 500) throw new Error("domain_limit_exceeded");

  const context = {
    merchantId: merchant.id,
    collectionMethod: batch.collectionMethod,
    rightsStatus: merchant.rightsStatus,
    rightsEvidenceRef: merchant.rightsEvidenceRef,
    verifiedHosts: approvedDomains.map((row) => row.hostname)
  };
  const results = validateStagingBatch(batch.rows, context, now);

  // Database UNIQUE (merchant_id, source_batch_key) is the concurrency gate.
  // No auto-upsert or retry into the same source batch.
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(sourceImportBatches).values({
      merchantId: batch.merchantId,
      sourceBatchKey: batch.sourceBatchKey,
      collectionMethod: batch.collectionMethod,
      rightsEvidenceRef: merchant.rightsEvidenceRef,
      status: results.every((row) => row.status === "quarantined") ? "quarantined" : "pending_review"
    }).returning({ id: sourceImportBatches.id });
    if (!created) throw new Error("insert_failed");
    await tx.insert(stagedPriceRecords).values(batch.rows.map((row, index) => ({
      batchId: created.id,
      externalOfferId: typeof row.externalOfferId === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(row.externalOfferId)
        ? row.externalOfferId : "invalid-row-" + index,
      rowIndex: index,
      payload: row,
      validationStatus: results[index].status,
      rejectionReasons: results[index].reasons
    })));
    return { batchId: created.id, staged: results.filter((r) => r.status === "pending_review").length,
      quarantined: results.filter((r) => r.status === "quarantined").length,
      published: 0 };
  });
}
