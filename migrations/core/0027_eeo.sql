-- A separate, explicit grant: existing grants retain their attribution and date.
-- wl_permissions has only its composite primary-key index, no inbound foreign
-- keys or triggers. Rebuilding preserves that key and its member foreign key.
CREATE TABLE wl_permissions_eeo (
  member_id TEXT NOT NULL REFERENCES wl_members(id),
  permission TEXT NOT NULL CHECK (permission IN ('people.manage', 'people.private', 'pay.read', 'leave.manage', 'payroll.handoff', 'documents.private', 'reports.read', 'it.tasks', 'audit.read', 'eeo.read')),
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, permission)
);
INSERT INTO wl_permissions_eeo (member_id, permission, granted_by, granted_at)
  SELECT member_id, permission, granted_by, granted_at FROM wl_permissions;
DROP TABLE wl_permissions;
ALTER TABLE wl_permissions_eeo RENAME TO wl_permissions;

-- Voluntary complete answer snapshots, separate from ordinary person records,
-- custom fields, contexts and employee exports. No HR editing or imports.
CREATE TABLE wl_eeo_answers (
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  sequence INTEGER NOT NULL CHECK (typeof(sequence) = 'integer' AND sequence > 0),
  race_ethnicity TEXT CHECK (race_ethnicity IS NULL OR race_ethnicity IN ('hispanic_latino', 'white', 'black_african_american', 'asian', 'native_hawaiian_pacific_islander', 'american_indian_alaska_native', 'two_or_more', 'declined')),
  sex TEXT CHECK (sex IS NULL OR sex IN ('female', 'male', 'nonbinary', 'declined')),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0),
  recorded_on TEXT NOT NULL CHECK (length(recorded_on) = 10 AND recorded_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  recorded_by TEXT NOT NULL REFERENCES wl_members(id),
  PRIMARY KEY (person_id, sequence)
) WITHOUT ROWID;
CREATE INDEX wl_eeo_answers_date ON wl_eeo_answers(person_id, recorded_on, sequence);
CREATE TRIGGER wl_eeo_answers_immutable BEFORE UPDATE ON wl_eeo_answers
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_answers_keep BEFORE DELETE ON wl_eeo_answers
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
-- REPLACE cannot bypass append-only protection with recursive_triggers off.
CREATE TRIGGER wl_eeo_answers_no_replace BEFORE INSERT ON wl_eeo_answers
WHEN EXISTS (SELECT 1 FROM wl_eeo_answers WHERE person_id = NEW.person_id AND sequence = NEW.sequence)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_answers_sequence BEFORE INSERT ON wl_eeo_answers
WHEN NEW.sequence <> COALESCE((SELECT MAX(sequence) FROM wl_eeo_answers WHERE person_id = NEW.person_id), 0) + 1
  OR EXISTS (SELECT 1 FROM wl_eeo_answers WHERE person_id = NEW.person_id AND (recorded_at > NEW.recorded_at OR recorded_on > NEW.recorded_on))
BEGIN SELECT RAISE(ABORT, 'willow_eeo_invalid_sequence'); END;
