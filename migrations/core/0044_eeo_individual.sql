-- EEO-001: `eeo.individual` is a separate permission that no level, grant migration, ownership
-- or other permission implies. wl_permissions has no inbound foreign keys; the view over it is
-- dropped and recreated unchanged around the rebuild.
DROP VIEW wl_effective_permissions;
CREATE TABLE wl_permissions_individual (
  member_id TEXT NOT NULL REFERENCES wl_members(id),
  permission TEXT NOT NULL CHECK (permission IN ('people.manage', 'people.private', 'pay.read', 'leave.manage', 'payroll.handoff', 'documents.private', 'reports.read', 'it.tasks', 'audit.read', 'eeo.read', 'eeo.individual')),
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, permission)
);
INSERT INTO wl_permissions_individual (member_id, permission, granted_by, granted_at) SELECT member_id, permission, granted_by, granted_at FROM wl_permissions;
DROP TABLE wl_permissions;
ALTER TABLE wl_permissions_individual RENAME TO wl_permissions;
CREATE VIEW wl_effective_permissions AS
 SELECT member_id,permission FROM wl_permissions
 UNION
 SELECT a.member_id,p.permission FROM wl_member_levels a
 JOIN wl_levels l ON l.id=a.level_id AND l.scope_kind='everyone'
 JOIN wl_level_permissions p ON p.level_id=a.level_id
 JOIN wl_members m ON m.id=a.member_id AND m.status='active';

-- Form version 2 asks ethnicity first, then race as one or more categories; the EEO-1 category
-- is derived at write time by the pinned rule and stored in race_ethnicity, so the diversity
-- aggregate reads both versions alike. Version 1 rows keep their combined answer exactly.
ALTER TABLE wl_eeo_answers ADD COLUMN form_version INTEGER NOT NULL DEFAULT 1 CHECK (form_version IN (1, 2));
ALTER TABLE wl_eeo_answers ADD COLUMN hispanic TEXT CHECK (hispanic IS NULL OR hispanic IN ('yes', 'no', 'declined'));
ALTER TABLE wl_eeo_answers ADD COLUMN races TEXT;
ALTER TABLE wl_eeo_answers ADD COLUMN rule_version TEXT;
ALTER TABLE wl_eeo_answers ADD COLUMN veteran TEXT CHECK (veteran IS NULL OR veteran IN ('protected', 'not_protected', 'declined'));
ALTER TABLE wl_eeo_answers ADD COLUMN veteran_classes TEXT;
ALTER TABLE wl_eeo_answers ADD COLUMN disability TEXT CHECK (disability IS NULL OR disability IN ('yes', 'no', 'declined'));
ALTER TABLE wl_eeo_answers ADD COLUMN contractor_forms TEXT;

-- HR-recorded categories from employment records: separate, immutable, never the employee's answer.
CREATE TABLE wl_eeo_recorded (
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  sequence INTEGER NOT NULL CHECK (typeof(sequence) = 'integer' AND sequence > 0),
  dimension TEXT NOT NULL CHECK (dimension IN ('race_ethnicity', 'sex')),
  category TEXT NOT NULL CHECK (category IN ('hispanic_latino', 'white', 'black_african_american', 'asian', 'native_hawaiian_pacific_islander', 'american_indian_alaska_native', 'two_or_more', 'female', 'male')),
  employment_record TEXT NOT NULL CHECK (length(employment_record) BETWEEN 1 AND 200),
  rule_version TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES wl_members(id),
  recorded_at INTEGER NOT NULL,
  recorded_on TEXT NOT NULL CHECK (length(recorded_on) = 10),
  PRIMARY KEY (person_id, sequence)
) WITHOUT ROWID;
CREATE TRIGGER wl_eeo_recorded_immutable BEFORE UPDATE ON wl_eeo_recorded BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_recorded_keep BEFORE DELETE ON wl_eeo_recorded BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_recorded_sequence BEFORE INSERT ON wl_eeo_recorded
WHEN NEW.sequence <> COALESCE((SELECT MAX(sequence) FROM wl_eeo_recorded WHERE person_id = NEW.person_id), 0) + 1
BEGIN SELECT RAISE(ABORT, 'willow_eeo_invalid_sequence'); END;
