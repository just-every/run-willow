-- Native signature template definitions; sending and signing are separate capabilities.
CREATE TABLE wl_sign_templates (
 id TEXT PRIMARY KEY,
 family TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 title TEXT NOT NULL,
 source_version TEXT NOT NULL REFERENCES wl_company_file_versions(id),
 source_sha256 TEXT NOT NULL,
 category_id TEXT NOT NULL REFERENCES wl_doc_categories(id),
 signers_json TEXT NOT NULL CHECK(json_valid(signers_json)),
 fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
 recorded_by TEXT NOT NULL,
 recorded_at INTEGER NOT NULL,
 UNIQUE(family,version)
);
CREATE TABLE wl_sign_template_approvals (
 template_id TEXT PRIMARY KEY REFERENCES wl_sign_templates(id),
 approved_by TEXT NOT NULL,
 approved_at INTEGER NOT NULL,
 digest TEXT NOT NULL
);
CREATE TRIGGER wl_sign_templates_immutable BEFORE UPDATE ON wl_sign_templates
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_sign_template_approvals_immutable BEFORE UPDATE ON wl_sign_template_approvals
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
