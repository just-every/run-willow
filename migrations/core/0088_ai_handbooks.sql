-- General employer policy is separate from employee document custody.
CREATE TABLE wl_ai_handbooks (
 id TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES wl_members(id),
 created_at INTEGER NOT NULL,
 withdrawn_at INTEGER,
 withdrawn_by TEXT REFERENCES wl_members(id)
);
CREATE TABLE wl_ai_handbook_versions (
 id TEXT PRIMARY KEY,
 handbook_id TEXT NOT NULL REFERENCES wl_ai_handbooks(id),
 version INTEGER NOT NULL CHECK(version > 0),
 title TEXT NOT NULL,
 clauses_json TEXT NOT NULL CHECK(json_valid(clauses_json)),
 created_by TEXT NOT NULL REFERENCES wl_members(id),
 created_at INTEGER NOT NULL,
 UNIQUE(handbook_id, version)
);
CREATE TABLE wl_ai_handbook_approvals (
 version_id TEXT PRIMARY KEY REFERENCES wl_ai_handbook_versions(id),
 approved_by TEXT NOT NULL REFERENCES wl_members(id),
 approved_at INTEGER NOT NULL,
 attestation_version TEXT NOT NULL
);
CREATE TABLE wl_ai_handbook_inclusions (
 version_id TEXT PRIMARY KEY REFERENCES wl_ai_handbook_approvals(version_id),
 included_by TEXT NOT NULL REFERENCES wl_members(id),
 included_at INTEGER NOT NULL
);
CREATE TRIGGER wl_ai_handbook_version_immutable_update BEFORE UPDATE ON wl_ai_handbook_versions
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_ai_handbook_version_immutable_delete BEFORE DELETE ON wl_ai_handbook_versions
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_ai_handbook_approval_immutable_update BEFORE UPDATE ON wl_ai_handbook_approvals
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_ai_handbook_approval_immutable_delete BEFORE DELETE ON wl_ai_handbook_approvals
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
