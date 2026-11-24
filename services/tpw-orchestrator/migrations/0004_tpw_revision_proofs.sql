-- Synthetic local revocation and exact operation receipts. No actual license authorization.
CREATE TABLE tpw_revision_revocations (token TEXT PRIMARY KEY NOT NULL, revoked_at INTEGER NOT NULL);
CREATE TABLE tpw_revision_operations (operation_hash TEXT PRIMARY KEY NOT NULL, revision_hash TEXT NOT NULL REFERENCES tpw_device_revisions(revision_hash), candidate_id TEXT NOT NULL, run_slot TEXT NOT NULL, proof_hash TEXT NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN ('APPENDED','UNCHANGED')), recorded_at INTEGER NOT NULL);
