-- Append-only local dry-run revision receipts. No real source permissions.
CREATE TABLE tpw_device_variants (variant_key TEXT PRIMARY KEY NOT NULL, brand TEXT NOT NULL, sku TEXT NOT NULL, region TEXT NOT NULL);
CREATE TABLE tpw_device_revisions (revision_hash TEXT PRIMARY KEY, variant_key TEXT NOT NULL REFERENCES tpw_device_variants(variant_key), previous_hash TEXT REFERENCES tpw_device_revisions(revision_hash), data_hash TEXT NOT NULL, evidence_hash TEXT NOT NULL, spec_json TEXT NOT NULL, recorded_at INTEGER NOT NULL);
CREATE TABLE tpw_revision_heads (variant_key TEXT PRIMARY KEY REFERENCES tpw_device_variants(variant_key), revision_hash TEXT NOT NULL REFERENCES tpw_device_revisions(revision_hash));
CREATE TABLE tpw_revision_approvals (revision_hash TEXT PRIMARY KEY REFERENCES tpw_device_revisions(revision_hash), review_hash TEXT NOT NULL, candidate_hash TEXT NOT NULL, run_slot TEXT NOT NULL, approved_at INTEGER NOT NULL);
CREATE TABLE tpw_source_rights (revision_hash TEXT NOT NULL REFERENCES tpw_device_revisions(revision_hash), source_url TEXT NOT NULL, publisher TEXT NOT NULL, claim_hash TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope='SYNTHETIC_LINK_ONLY'), PRIMARY KEY(revision_hash,source_url,claim_hash));
CREATE INDEX ix_tpw_revision_variant ON tpw_device_revisions(variant_key,recorded_at);
