-- Local CI only; existing stage rows remain unscoped and cannot enter coordinated runs.
ALTER TABLE tpw_stage ADD COLUMN run_slot TEXT;
CREATE TABLE tpw_hourly_run (
 slot TEXT NOT NULL CHECK(length(slot)=10),
 agent TEXT NOT NULL CHECK(agent IN ('TPW1','TPW2','TPW3')),
 state TEXT NOT NULL CHECK(state IN ('RUNNING','SUCCEEDED','FAILED')),
 owner TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 deadline INTEGER NOT NULL,
 finished_at INTEGER,
 PRIMARY KEY(slot,agent),
 CHECK ((state='RUNNING' AND finished_at IS NULL) OR (state<>'RUNNING' AND finished_at IS NOT NULL))
);
CREATE INDEX ix_tpw_stage_slot ON tpw_stage(run_slot,state,expires_at);
