-- Training approvals join the shared immutable proposal and decision history.
CREATE TABLE wl_self_changes_training (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES wl_people(id), kind TEXT NOT NULL CHECK(kind IN ('legalName','dependent','personal','document','customField','goal','review','recordRow','training')),
 row_id TEXT, before_json TEXT NOT NULL CHECK(json_valid(before_json)), after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 source_revision TEXT NOT NULL, table_version_id TEXT, requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL, due_date TEXT NOT NULL
);
CREATE TABLE wl_self_decisions_training (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes_training(id), outcome TEXT NOT NULL CHECK(outcome IN ('approved','rejected')),
 decided_by TEXT NOT NULL, decided_at INTEGER NOT NULL, comment TEXT NOT NULL
);
CREATE TABLE wl_self_reconciliation_training (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes_training(id), reference TEXT NOT NULL, recorded_by TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
INSERT INTO wl_self_changes_training SELECT * FROM wl_self_changes;
INSERT INTO wl_self_decisions_training SELECT * FROM wl_self_decisions;
INSERT INTO wl_self_reconciliation_training SELECT * FROM wl_self_reconciliation;
DROP TABLE wl_self_reconciliation;
DROP TABLE wl_self_decisions;
DROP TABLE wl_self_changes;
ALTER TABLE wl_self_changes_training RENAME TO wl_self_changes;
ALTER TABLE wl_self_decisions_training RENAME TO wl_self_decisions;
ALTER TABLE wl_self_reconciliation_training RENAME TO wl_self_reconciliation;
CREATE TRIGGER wl_self_changes_immutable BEFORE UPDATE ON wl_self_changes WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_changes_keep BEFORE DELETE ON wl_self_changes WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_immutable BEFORE UPDATE ON wl_self_decisions WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_keep BEFORE DELETE ON wl_self_decisions WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_immutable BEFORE UPDATE ON wl_self_reconciliation WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_keep BEFORE DELETE ON wl_self_reconciliation WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;



-- Preserve pending and decided legacy requests without granting new authority.
INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,requested_by,requested_at,due_date)
SELECT r.id,r.person_id,'training',r.target_id,
 CASE WHEN r.operation='assign' THEN 'null'
 ELSE json_object('assignment',r.target_id,'course',a.course_id,'dueDate',a.due_date) END,
 json_object('operation',r.operation,'payload',json(r.payload_json),'target',r.target_id),
 r.source_revision,r.requested_by,r.requested_at,date(r.requested_at/1000,'unixepoch','+7 days')
FROM wl_training_requests r LEFT JOIN wl_training_assignments a ON a.id=r.target_id;
INSERT INTO wl_self_decisions(change_id,outcome,decided_by,decided_at,comment)
SELECT request_id,outcome,decided_by,decided_at,reason FROM wl_training_decisions;
