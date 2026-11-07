/**
 * Price domain — PostgreSQL / Drizzle. No real data is seeded or published.
 * All names, prices and source links are read from a separately provisioned,
 * rights-cleared database, never from public demo fixtures.
 */
import {
  boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar
} from "drizzle-orm/pg-core";

export const deviceVariants = pgTable("device_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  brand: varchar("brand", { length: 100 }).notNull(),
  modelCode: varchar("model_code", { length: 150 }).notNull(),
  market: varchar("market", { length: 2 }).notNull(),
  ramGb: integer("ram_gb").notNull(),
  storageGb: integer("storage_gb").notNull(),
  colorCode: varchar("color_code", { length: 100 }).notNull(),
  itemCondition: varchar("item_condition", { length: 24 }).notNull(),
  warrantyClass: varchar("warranty_class", { length: 48 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("device_variants_identity_idx").on(
    table.brand, table.modelCode, table.market, table.ramGb,
    table.storageGb, table.colorCode, table.itemCondition, table.warrantyClass
  )
]);

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  market: varchar("market", { length: 2 }).notNull(),
  rightsStatus: varchar("rights_status", { length: 24 }).notNull().default("pending"),
  rightsEvidenceRef: text("rights_evidence_ref"),
  affiliateProgramStatus: varchar("affiliate_program_status", { length: 24 }).notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const merchantDomains = pgTable("merchant_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
  hostname: varchar("hostname", { length: 253 }).notNull(),
  verificationStatus: varchar("verification_status", { length: 24 }).notNull().default("pending"),
  verificationEvidenceRef: text("verification_evidence_ref"),
  verifiedAt: timestamp("verified_at", { withTimezone: true })
}, (table) => [
  uniqueIndex("merchant_domains_unique_idx").on(table.merchantId, table.hostname),
  index("merchant_domains_status_idx").on(table.merchantId, table.verificationStatus)
]);

export const merchantOffers = pgTable("merchant_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
  deviceVariantId: uuid("device_variant_id").notNull().references(() => deviceVariants.id),
  merchantSku: varchar("merchant_sku", { length: 160 }).notNull(),
  productUrl: text("product_url").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  market: varchar("market", { length: 2 }).notNull(),
  publishingStatus: varchar("publishing_status", { length: 24 }).notNull().default("draft"),
  affiliate: boolean("affiliate").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("merchant_offers_sku_unique_idx").on(table.merchantId, table.merchantSku),
  index("merchant_offers_variant_status_idx").on(table.deviceVariantId, table.publishingStatus)
]);

export const priceObservations = pgTable("price_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  offerId: uuid("offer_id").notNull().references(() => merchantOffers.id),
  productPriceMinor: integer("product_price_minor").notNull(),
  mandatoryShippingMinor: integer("mandatory_shipping_minor"),
  taxIncluded: boolean("tax_included").notNull(),
  stockStatus: varchar("stock_status", { length: 24 }).notNull(),
  evidenceRef: text("evidence_ref").notNull(),
  collectionMethod: varchar("collection_method", { length: 24 }).notNull(),
  verificationStatus: varchar("verification_status", { length: 24 }).notNull().default("pending"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("price_observations_offer_observed_idx").on(table.offerId, table.observedAt)
]);


export const sourceImportBatches = pgTable("source_import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
  collectionMethod: varchar("collection_method", { length: 24 }).notNull(),
  rightsEvidenceRef: text("rights_evidence_ref").notNull(),
  sourceBatchKey: varchar("source_batch_key", { length: 160 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending_review"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("source_import_batches_unique_idx").on(table.merchantId, table.sourceBatchKey)
]);

export const stagedPriceRecords = pgTable("staged_price_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull().references(() => sourceImportBatches.id),
  externalOfferId: varchar("external_offer_id", { length: 120 }).notNull(),
  payload: text("payload").notNull(),
  validationStatus: varchar("validation_status", { length: 24 }).notNull(),
  rejectionReasons: text("rejection_reasons").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("staged_price_records_unique_idx").on(table.batchId, table.externalOfferId),
  index("staged_price_records_status_idx").on(table.validationStatus, table.receivedAt)
]);
