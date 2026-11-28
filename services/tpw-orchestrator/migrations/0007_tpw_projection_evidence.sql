-- Local only. Legacy unbound receipts cannot be read, reconciled or extended by the V2 gateway.
ALTER TABLE tpw_news_projection_ops ADD COLUMN evidence_hash TEXT CHECK(evidence_hash IS NULL OR (length(evidence_hash)=64 AND evidence_hash NOT GLOB '*[^0-9a-f]*'));
