-- D1 pre-filtered metadata staging only; application TTL=2h, not secure erasure.
CREATE TABLE IF NOT EXISTS tpw_stage (
 candidate_id TEXT PRIMARY KEY NOT NULL CHECK(length(candidate_id) BETWEEN 11 AND 98),
 kind TEXT NOT NULL CHECK(kind IN ('news','device')),
 source_url TEXT NOT NULL,
 metadata_json TEXT NOT NULL CHECK(length(metadata_json) <= 8000),
 observed_at TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','APPROVED','REJECTED','QUARANTINED')),
 lease_owner TEXT,
 lease_until INTEGER,
 CHECK ((state='PROCESSING' AND lease_owner IS NOT NULL AND lease_until IS NOT NULL)
     OR (state<>'PROCESSING' AND lease_owner IS NULL AND lease_until IS NULL))
);
CREATE INDEX IF NOT EXISTS ix_tpw_stage_pending ON tpw_stage (state,expires_at,observed_at);
