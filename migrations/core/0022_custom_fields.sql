-- Identity classification/key never change. Edits, corrections and retirement
-- append complete definitions; history keeps the exact definition used.
CREATE TABLE wl_custom_fields (
  id TEXT NOT NULL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE CHECK (length(key) BETWEEN 1 AND 64 AND key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z0-9_]*'),
  classification TEXT NOT NULL CHECK (classification IN ('general', 'hr', 'payroll')),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0),
  recorded_by TEXT NOT NULL CHECK (length(trim(recorded_by)) > 0)
) WITHOUT ROWID;
CREATE TABLE wl_custom_field_versions (
  id TEXT NOT NULL PRIMARY KEY,
  field_id TEXT NOT NULL REFERENCES wl_custom_fields(id),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version > 0),
  effective_from TEXT NOT NULL CHECK (length(effective_from) = 10 AND effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 200),
  type TEXT NOT NULL CHECK (type IN ('text', 'number', 'date', 'boolean', 'select')),
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  employee_read INTEGER NOT NULL CHECK (employee_read IN (0, 1)),
  manager_read INTEGER NOT NULL CHECK (manager_read IN (0, 1)),
  validation_json TEXT NOT NULL CHECK (json_valid(validation_json) AND json_type(validation_json) = 'object'),
  retired INTEGER NOT NULL CHECK (retired IN (0, 1)),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0),
  recorded_by TEXT NOT NULL CHECK (length(trim(recorded_by)) > 0),
  UNIQUE (field_id, version),
  UNIQUE (field_id, id)
) WITHOUT ROWID;
CREATE INDEX wl_custom_field_versions_date ON wl_custom_field_versions(field_id, effective_from, version);
CREATE TABLE wl_custom_field_values (
  id TEXT NOT NULL PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  field_id TEXT NOT NULL REFERENCES wl_custom_fields(id),
  definition_version_id TEXT NOT NULL,
  effective_from TEXT NOT NULL CHECK (length(effective_from) = 10 AND effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  sequence INTEGER NOT NULL CHECK (typeof(sequence) = 'integer' AND sequence > 0),
  value_json TEXT NOT NULL CHECK (json_valid(value_json) AND json_type(value_json) IN ('text', 'true', 'false', 'null')),
  corrects_id TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('native', 'import')),
  revision TEXT NOT NULL CHECK (length(trim(revision)) > 0),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0),
  recorded_by TEXT NOT NULL CHECK (length(trim(recorded_by)) > 0),
  FOREIGN KEY (field_id, definition_version_id) REFERENCES wl_custom_field_versions(field_id, id),
  FOREIGN KEY (person_id, field_id, corrects_id) REFERENCES wl_custom_field_values(person_id, field_id, id),
  CHECK (corrects_id IS NULL OR corrects_id <> id),
  UNIQUE (person_id, field_id, sequence),
  UNIQUE (person_id, field_id, id)
) WITHOUT ROWID;
CREATE INDEX wl_custom_field_values_date ON wl_custom_field_values(person_id, field_id, effective_from, sequence);

CREATE TRIGGER wl_custom_fields_immutable BEFORE UPDATE ON wl_custom_fields BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_custom_fields_keep BEFORE DELETE ON wl_custom_fields BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_custom_field_versions_immutable BEFORE UPDATE ON wl_custom_field_versions BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_custom_field_versions_keep BEFORE DELETE ON wl_custom_field_versions BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_custom_field_values_immutable BEFORE UPDATE ON wl_custom_field_values BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
-- The import target must fence the complete before-image and revision in its
-- undo batch, as for existing Willow targets. Native revisions cannot be removed.
CREATE TRIGGER wl_custom_field_values_keep BEFORE DELETE ON wl_custom_field_values WHEN OLD.origin <> 'import' BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;

-- REPLACE must not bypass append-only rules, even with recursive_triggers off.
CREATE TRIGGER wl_custom_fields_no_replace BEFORE INSERT ON wl_custom_fields
WHEN EXISTS (SELECT 1 FROM wl_custom_fields WHERE id = NEW.id OR key = NEW.key)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_custom_field_versions_no_replace BEFORE INSERT ON wl_custom_field_versions
WHEN EXISTS (SELECT 1 FROM wl_custom_field_versions WHERE id = NEW.id OR (field_id = NEW.field_id AND version = NEW.version))
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_custom_field_values_no_replace BEFORE INSERT ON wl_custom_field_values
WHEN EXISTS (SELECT 1 FROM wl_custom_field_values WHERE id = NEW.id OR (person_id = NEW.person_id AND field_id = NEW.field_id AND sequence = NEW.sequence))
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_custom_field_values_correction BEFORE INSERT ON wl_custom_field_values
WHEN NEW.corrects_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM wl_custom_field_values WHERE id = NEW.corrects_id
    AND (person_id <> NEW.person_id OR field_id <> NEW.field_id OR sequence >= NEW.sequence)
)
BEGIN SELECT RAISE(ABORT, 'willow_invalid_field_correction'); END;
CREATE TRIGGER wl_custom_field_values_correction_children AFTER INSERT ON wl_custom_field_values
WHEN EXISTS (SELECT 1 FROM wl_custom_field_values WHERE corrects_id = NEW.id AND (person_id <> NEW.person_id OR field_id <> NEW.field_id OR sequence <= NEW.sequence))
BEGIN SELECT RAISE(ABORT, 'willow_invalid_field_correction'); END;
CREATE TRIGGER wl_custom_field_values_type BEFORE INSERT ON wl_custom_field_values
WHEN EXISTS (
  SELECT 1 FROM wl_custom_field_versions d WHERE d.id = NEW.definition_version_id AND (
    (d.required = 1 AND (json_type(NEW.value_json) = 'null' OR (json_type(NEW.value_json) = 'text' AND length(trim(json_extract(NEW.value_json, '$'))) = 0))) OR
    (json_type(NEW.value_json) <> 'null' AND ((d.type = 'boolean' AND json_type(NEW.value_json) NOT IN ('true', 'false')) OR (d.type <> 'boolean' AND json_type(NEW.value_json) <> 'text')))
  )
)
BEGIN SELECT RAISE(ABORT, 'willow_invalid_field_value'); END;
