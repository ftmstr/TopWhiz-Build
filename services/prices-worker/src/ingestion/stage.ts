/**
 * Offline/authorized ingestion entrypoint; NOT imported by public Worker.
 * Staging is the only persistence mutation here. Publication requires an
 * entirely separate reviewer and privileges that are NOT implemented.
 */
import { eq } from "drizzle-orm";
import { sourceImportBatches, stagedPriceRecords } from "../db/schema";
import { validateStagingBatch } from "./validate.mjs";

type ImportedRow = {
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
type SourceContext = {
  merchantId: string;
  collectionMethod: string;
  rightsEvidenceRef: string;
  rightsStatus: string;
  verifiedHosts: string[];
};
export type IngestionBatch = {
  sourceBatchKey: string;
  context: SourceContext;
  rows: ImportedRow[];
};

/**
 * Drizzle transaction/insert adapter is deliberately injected by caller.
 * Import credentials should have INSERT on staging tables only.
 */
export async function stageFeedBatch(db: any, batch: IngestionBatch, now = new Date()) {
  if (!batch || typeof batch.sourceBatchKey !== "string" ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(batch.sourceBatchKey)) throw new Error("invalid_batch_key");
  if (!batch.context || !batch.context.rightsEvidenceRef?.trim()) throw new Error("missing_rights_evidence");
  const results = validateStagingBatch(batch.rows, batch.context, now);
  const existing = await db.select({ id: sourceImportBatches.id })
    .from(sourceImportBatches)
    .where(eq(sourceImportBatches.merchantId, batch.context.merchantId))
    .limit(100); // deliberately small; a more specific unique-key lookup follows
  // Never modify a previously imported source batch.
  const existingBatch = await db.select({ id: sourceImportBatches.id })
    .from(sourceImportBatches)
    .where(eq(sourceImportBatches.sourceBatchKey, batch.sourceBatchKey))
    .limit(101);
  // Fail closed on key reuse. The database unique index covers concurrent calls.
  if (existingBatch.length > 100 || existing.length > 100) throw new Error("batch_lookup_limit");
  if (existingBatch.length) throw new Error("duplicate_source_batch_key");

  return db.transaction(async (tx: any) => {
    const [created] = await tx.insert(sourceImportBatches).values({
      merchantId: batch.context.merchantId,
      sourceBatchKey: batch.sourceBatchKey,
      collectionMethod: batch.context.collectionMethod,
      rightsEvidenceRef: batch.context.rightsEvidenceRef,
      status: results.every((row) => row.status === "quarantined") ? "quarantined" : "pending_review"
    }).returning({ id: sourceImportBatches.id });
    if (!created) throw new Error("insert_failed");
    await tx.insert(stagedPriceRecords).values(batch.rows.map((row, index) => ({
      batchId: created.id,
      externalOfferId: row.externalOfferId,
      payload: row,
      validationStatus: results[index].status,
      rejectionReasons: results[index].reasons
    })));
    return { batchId: created.id, staged: results.filter((r) => r.status === "pending_review").length,
      quarantined: results.filter((r) => r.status === "quarantined").length,
      published: 0 };
  });
}
