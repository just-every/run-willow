-- No rows are seeded: existing self-write defaults and all read rights remain unchanged.
CREATE TABLE wl_level_self_fields (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 field TEXT NOT NULL CHECK(field IN ('preferredName','personal_email','phone','address','date_of_birth','emergency_contact')),
 mode TEXT NOT NULL CHECK(mode IN ('view','approval','edit')),
 PRIMARY KEY(level_id,field)
);

-- Rebuild the proposal and its two referencing tables together. Copy children
-- against the replacement parent, then drop old children before the old parent.
-- This works with D1 foreign keys enabled and preserves every saved byte. Rename
-- only the replacement parent so SQLite updates its new children's references.
CREATE TABLE wl_self_changes_personal (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES wl_people(id), kind TEXT NOT NULL CHECK(kind IN ('legalName','dependent','personal')),
 row_id TEXT, before_json TEXT NOT NULL CHECK(json_valid(before_json)), after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 source_revision TEXT NOT NULL, table_version_id TEXT, requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL, due_date TEXT NOT NULL
);
CREATE TABLE wl_self_decisions_personal (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes_personal(id), outcome TEXT NOT NULL CHECK(outcome IN ('approved','rejected')),
 decided_by TEXT NOT NULL, decided_at INTEGER NOT NULL, comment TEXT NOT NULL
);
CREATE TABLE wl_self_reconciliation_personal (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes_personal(id), reference TEXT NOT NULL, recorded_by TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
INSERT INTO wl_self_changes_personal SELECT * FROM wl_self_changes;
INSERT INTO wl_self_decisions_personal SELECT * FROM wl_self_decisions;
INSERT INTO wl_self_reconciliation_personal SELECT * FROM wl_self_reconciliation;
DROP TABLE wl_self_reconciliation;
DROP TABLE wl_self_decisions;
DROP TABLE wl_self_changes;
ALTER TABLE wl_self_changes_personal RENAME TO wl_self_changes;
ALTER TABLE wl_self_decisions_personal RENAME TO wl_self_decisions;
ALTER TABLE wl_self_reconciliation_personal RENAME TO wl_self_reconciliation;
CREATE TRIGGER wl_self_changes_immutable BEFORE UPDATE ON wl_self_changes BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_changes_keep BEFORE DELETE ON wl_self_changes BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_immutable BEFORE UPDATE ON wl_self_decisions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_keep BEFORE DELETE ON wl_self_decisions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_immutable BEFORE UPDATE ON wl_self_reconciliation BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_keep BEFORE DELETE ON wl_self_reconciliation BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
