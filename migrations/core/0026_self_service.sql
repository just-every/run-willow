-- SELF-001: private dependent records and immutable employee proposals/outcomes.
INSERT INTO wl_record_tables VALUES ('table-dependents','dependents','contact',1,0,'system');
INSERT INTO wl_record_table_versions VALUES ('table-dependents-v1','table-dependents',1,'Dependents',0,0,'[{"key":"name","label":"Name","type":"text","required":true,"validation":{"maxLength":160}},{"key":"relationship","label":"Relationship","type":"text","required":true,"validation":{"maxLength":80}},{"key":"date_of_birth","label":"Date of birth","type":"date","required":false,"validation":{}}]',0,0,'system');
CREATE TABLE wl_self_changes (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES wl_people(id), kind TEXT NOT NULL CHECK(kind IN ('legalName','dependent')),
 row_id TEXT, before_json TEXT NOT NULL CHECK(json_valid(before_json)), after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 source_revision TEXT NOT NULL, table_version_id TEXT, requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL, due_date TEXT NOT NULL
);
CREATE TABLE wl_self_decisions (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes(id), outcome TEXT NOT NULL CHECK(outcome IN ('approved','rejected')),
 decided_by TEXT NOT NULL, decided_at INTEGER NOT NULL, comment TEXT NOT NULL
);
CREATE TABLE wl_self_reconciliation (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes(id), reference TEXT NOT NULL, recorded_by TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
CREATE TRIGGER wl_self_changes_immutable BEFORE UPDATE ON wl_self_changes BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_changes_keep BEFORE DELETE ON wl_self_changes BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_immutable BEFORE UPDATE ON wl_self_decisions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_keep BEFORE DELETE ON wl_self_decisions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_immutable BEFORE UPDATE ON wl_self_reconciliation BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_keep BEFORE DELETE ON wl_self_reconciliation BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
