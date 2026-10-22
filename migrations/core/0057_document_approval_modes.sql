CREATE TABLE wl_self_changes_documents (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES wl_people(id), kind TEXT NOT NULL CHECK(kind IN ('legalName','dependent','personal','document')),
 row_id TEXT, before_json TEXT NOT NULL CHECK(json_valid(before_json)), after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 source_revision TEXT NOT NULL, table_version_id TEXT, requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL, due_date TEXT NOT NULL
);
CREATE TABLE wl_self_decisions_documents (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes_documents(id), outcome TEXT NOT NULL CHECK(outcome IN ('approved','rejected')),
 decided_by TEXT NOT NULL, decided_at INTEGER NOT NULL, comment TEXT NOT NULL
);
CREATE TABLE wl_self_reconciliation_documents (
 change_id TEXT PRIMARY KEY REFERENCES wl_self_changes_documents(id), reference TEXT NOT NULL, recorded_by TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
INSERT INTO wl_self_changes_documents SELECT * FROM wl_self_changes;
INSERT INTO wl_self_decisions_documents SELECT * FROM wl_self_decisions;
INSERT INTO wl_self_reconciliation_documents SELECT * FROM wl_self_reconciliation;
DROP TABLE wl_self_reconciliation;
DROP TABLE wl_self_decisions;
DROP TABLE wl_self_changes;
ALTER TABLE wl_self_changes_documents RENAME TO wl_self_changes;
ALTER TABLE wl_self_decisions_documents RENAME TO wl_self_decisions;
ALTER TABLE wl_self_reconciliation_documents RENAME TO wl_self_reconciliation;
CREATE TRIGGER wl_self_changes_immutable BEFORE UPDATE ON wl_self_changes WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_changes_keep BEFORE DELETE ON wl_self_changes WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_immutable BEFORE UPDATE ON wl_self_decisions WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_decisions_keep BEFORE DELETE ON wl_self_decisions WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_immutable BEFORE UPDATE ON wl_self_reconciliation WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_self_reconciliation_keep BEFORE DELETE ON wl_self_reconciliation WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;

CREATE TABLE wl_document_proposals (
 version_id TEXT PRIMARY KEY, change_id TEXT NOT NULL UNIQUE,
 person_id TEXT NOT NULL REFERENCES wl_people(id), document_id TEXT NOT NULL,
 category_id TEXT NOT NULL REFERENCES wl_doc_categories(id), source_revision TEXT NOT NULL
);
CREATE TRIGGER wl_document_proposals_immutable BEFORE UPDATE ON wl_document_proposals BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_document_proposals_keep BEFORE DELETE ON wl_document_proposals WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TABLE wl_level_document_writes (
 level_id TEXT NOT NULL REFERENCES wl_levels(id), relation TEXT NOT NULL CHECK(relation IN ('self','others')),
 category_id TEXT NOT NULL REFERENCES wl_doc_categories(id), mode TEXT NOT NULL CHECK(mode IN ('none','view','approval','edit')),
 PRIMARY KEY(level_id,relation,category_id)
);
INSERT INTO wl_level_document_writes SELECT * FROM wl_level_document_categories;
DROP TABLE wl_level_document_categories;
ALTER TABLE wl_level_document_writes RENAME TO wl_level_document_categories;
