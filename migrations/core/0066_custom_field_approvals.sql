-- Preserve every immutable SELF-001 proposal and decision while admitting native custom-field proposals.
CREATE TABLE wl_self_changes_custom_fields (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES wl_people(id), kind TEXT NOT NULL CHECK(kind IN ('legalName','dependent','personal','document','customField')),
 row_id TEXT, before_json TEXT NOT NULL CHECK(json_valid(before_json)), after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 source_revision TEXT NOT NULL, table_version_id TEXT, requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL, due_date TEXT NOT NULL
);
CREATE TABLE wl_self_decisions_custom_fields (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes_custom_fields(id), outcome TEXT NOT NULL CHECK(outcome IN ('approved','rejected')),
 decided_by TEXT NOT NULL, decided_at INTEGER NOT NULL, comment TEXT NOT NULL
);
CREATE TABLE wl_self_reconciliation_custom_fields (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes_custom_fields(id), reference TEXT NOT NULL, recorded_by TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
INSERT INTO wl_self_changes_custom_fields SELECT * FROM wl_self_changes;
INSERT INTO wl_self_decisions_custom_fields SELECT * FROM wl_self_decisions;
INSERT INTO wl_self_reconciliation_custom_fields SELECT * FROM wl_self_reconciliation;
DROP TABLE wl_self_reconciliation;
DROP TABLE wl_self_decisions;
DROP TABLE wl_self_changes;
ALTER TABLE wl_self_changes_custom_fields RENAME TO wl_self_changes;
ALTER TABLE wl_self_decisions_custom_fields RENAME TO wl_self_decisions;
ALTER TABLE wl_self_reconciliation_custom_fields RENAME TO wl_self_reconciliation;
CREATE TRIGGER wl_self_changes_immutable BEFORE UPDATE ON wl_self_changes WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_changes_keep BEFORE DELETE ON wl_self_changes WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_immutable BEFORE UPDATE ON wl_self_decisions WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_keep BEFORE DELETE ON wl_self_decisions WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_immutable BEFORE UPDATE ON wl_self_reconciliation WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_keep BEFORE DELETE ON wl_self_reconciliation WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;

