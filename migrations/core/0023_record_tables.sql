-- PEOPLE-003: dated multi-row record tables. A table's key and classification
-- never change; label, visibility flags, columns and retirement append versions.
-- Built-in tables ship here; HR adds custom tables with typed columns.
CREATE TABLE wl_record_tables (
  id TEXT NOT NULL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE CHECK (length(key) BETWEEN 1 AND 64 AND key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z0-9_]*'),
  classification TEXT NOT NULL CHECK (classification IN ('contact', 'general', 'hr', 'payroll')),
  built_in INTEGER NOT NULL CHECK (built_in IN (0, 1)),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0),
  recorded_by TEXT NOT NULL CHECK (length(trim(recorded_by)) > 0)
) WITHOUT ROWID;
CREATE TABLE wl_record_table_versions (
  id TEXT NOT NULL PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES wl_record_tables(id),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version > 0),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 200),
  employee_read INTEGER NOT NULL CHECK (employee_read IN (0, 1)),
  manager_read INTEGER NOT NULL CHECK (manager_read IN (0, 1)),
  columns_json TEXT NOT NULL CHECK (json_valid(columns_json) AND json_type(columns_json) = 'array'),
  retired INTEGER NOT NULL CHECK (retired IN (0, 1)),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0),
  recorded_by TEXT NOT NULL CHECK (length(trim(recorded_by)) > 0),
  UNIQUE (table_id, version)
) WITHOUT ROWID;
-- A row is one entry (a contact, a credential, an asset). Each change appends a
-- complete dated version; removal is a version too, so history stays readable.
CREATE TABLE wl_record_rows (
  id TEXT NOT NULL PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES wl_record_tables(id),
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  origin TEXT NOT NULL CHECK (origin IN ('native', 'import')),
  revision TEXT NOT NULL CHECK (length(trim(revision)) > 0),
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX wl_record_rows_person ON wl_record_rows(person_id, table_id);
CREATE TABLE wl_record_row_versions (
  id TEXT NOT NULL PRIMARY KEY,
  row_id TEXT NOT NULL REFERENCES wl_record_rows(id),
  sequence INTEGER NOT NULL CHECK (typeof(sequence) = 'integer' AND sequence > 0),
  table_version_id TEXT NOT NULL REFERENCES wl_record_table_versions(id),
  effective_from TEXT NOT NULL CHECK (length(effective_from) = 10 AND effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  values_json TEXT NOT NULL CHECK (json_valid(values_json) AND json_type(values_json) = 'object'),
  removed INTEGER NOT NULL CHECK (removed IN (0, 1)),
  origin TEXT NOT NULL CHECK (origin IN ('native', 'import')),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0),
  recorded_by TEXT NOT NULL CHECK (length(trim(recorded_by)) > 0),
  UNIQUE (row_id, sequence)
) WITHOUT ROWID;

CREATE TRIGGER wl_record_tables_immutable BEFORE UPDATE ON wl_record_tables BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_record_tables_keep BEFORE DELETE ON wl_record_tables BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_record_table_versions_immutable BEFORE UPDATE ON wl_record_table_versions BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_record_table_versions_keep BEFORE DELETE ON wl_record_table_versions BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_record_row_versions_immutable BEFORE UPDATE ON wl_record_row_versions BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
-- Only an untouched imported row may be removed (strict undo fences it first).
CREATE TRIGGER wl_record_row_versions_keep BEFORE DELETE ON wl_record_row_versions WHEN OLD.origin <> 'import' BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_record_rows_keep BEFORE DELETE ON wl_record_rows WHEN OLD.origin <> 'import' BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;

-- A leaver's device-return task names the asset row it closes.
ALTER TABLE wl_case_tasks ADD COLUMN record_row_id TEXT REFERENCES wl_record_rows(id);

INSERT INTO wl_record_tables (id, key, classification, built_in, recorded_at, recorded_by) VALUES
  ('table-emergency-contacts', 'emergency_contacts', 'contact', 1, 0, 'system'),
  ('table-education', 'education', 'general', 1, 0, 'system'),
  ('table-certifications', 'certifications', 'general', 1, 0, 'system'),
  ('table-assets', 'assets', 'general', 1, 0, 'system');
INSERT INTO wl_record_table_versions (id, table_id, version, label, employee_read, manager_read, columns_json, retired, recorded_at, recorded_by) VALUES
  ('table-emergency-contacts-v1', 'table-emergency-contacts', 1, 'Emergency contacts', 0, 0, '[{"key":"name","label":"Name","type":"text","required":true,"validation":{"maxLength":160}},{"key":"relationship","label":"Relationship","type":"text","required":false,"validation":{"maxLength":80}},{"key":"phone","label":"Phone","type":"text","required":true,"validation":{"maxLength":40}},{"key":"email","label":"Email","type":"text","required":false,"validation":{"maxLength":254}},{"key":"primary","label":"Primary contact","type":"boolean","required":true,"validation":{}}]', 0, 0, 'system'),
  ('table-education-v1', 'table-education', 1, 'Education', 1, 1, '[{"key":"institution","label":"Institution","type":"text","required":true,"validation":{"maxLength":200}},{"key":"credential","label":"Degree or credential","type":"text","required":true,"validation":{"maxLength":200}},{"key":"field","label":"Field of study","type":"text","required":false,"validation":{"maxLength":200}},{"key":"completed_on","label":"Completed on","type":"date","required":false,"validation":{}}]', 0, 0, 'system'),
  ('table-certifications-v1', 'table-certifications', 1, 'Certifications and licenses', 1, 1, '[{"key":"name","label":"Certification or license","type":"text","required":true,"validation":{"maxLength":200}},{"key":"issuer","label":"Issuer","type":"text","required":false,"validation":{"maxLength":200}},{"key":"number","label":"Number","type":"text","required":false,"validation":{"maxLength":80}},{"key":"issued_on","label":"Issued on","type":"date","required":false,"validation":{}},{"key":"expires_on","label":"Expires on","type":"date","required":false,"validation":{}}]', 0, 0, 'system'),
  ('table-assets-v1', 'table-assets', 1, 'Company assets', 1, 1, '[{"key":"type","label":"Asset type","type":"text","required":true,"validation":{"maxLength":80}},{"key":"serial","label":"Serial number","type":"text","required":true,"validation":{"maxLength":120}},{"key":"description","label":"Description","type":"text","required":false,"validation":{"maxLength":200}},{"key":"assigned_on","label":"Assigned on","type":"date","required":true,"validation":{}},{"key":"returned_on","label":"Returned on","type":"date","required":false,"validation":{}},{"key":"condition","label":"Condition","type":"select","required":true,"validation":{"options":[{"value":"new","label":"New"},{"value":"good","label":"Good"},{"value":"fair","label":"Fair"},{"value":"damaged","label":"Damaged"},{"value":"lost","label":"Lost"}]}}]', 0, 0, 'system');
