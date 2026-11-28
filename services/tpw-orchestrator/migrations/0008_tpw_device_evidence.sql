-- Full signed SYNTHETIC evidence for new immutable revisions only. No real source or release permission.
CREATE TABLE tpw_device_evidence (revision_hash TEXT PRIMARY KEY NOT NULL REFERENCES tpw_device_revisions(revision_hash), article_json TEXT NOT NULL CHECK(length(article_json)<=60000), proof_json TEXT NOT NULL CHECK(length(proof_json)<=16000));
