-- Synthetic local authority epoch and append-only signed command history.
CREATE TABLE tpw_revision_authority (singleton INTEGER PRIMARY KEY CHECK(singleton=1), epoch INTEGER NOT NULL CHECK(epoch>=0));
INSERT INTO tpw_revision_authority(singleton,epoch) VALUES(1,0);
CREATE TABLE tpw_revision_authority_events (epoch INTEGER PRIMARY KEY CHECK(epoch>0), token TEXT NOT NULL UNIQUE REFERENCES tpw_revision_revocations(token), command_hash TEXT NOT NULL UNIQUE, signature TEXT NOT NULL, recorded_at INTEGER NOT NULL);
ALTER TABLE tpw_revision_operations ADD COLUMN authority_epoch INTEGER;
