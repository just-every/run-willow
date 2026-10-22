-- EEO-003: invite-only preboarding identities are neither Willow people nor members.
-- Bearer material is never stored: only SHA-256 of a cryptorandom 32-byte token.
CREATE TABLE wl_preboard_identities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  created_at INTEGER NOT NULL
);
CREATE TABLE wl_preboard_packets (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL UNIQUE REFERENCES wl_preboard_identities(id),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_by TEXT NOT NULL REFERENCES wl_members(id),
  created_at INTEGER NOT NULL,
  source_on TEXT NOT NULL CHECK (length(source_on) = 10),
  expires_on TEXT NOT NULL CHECK (length(expires_on) = 10 AND expires_on >= source_on),
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'linked')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  completed_at INTEGER,
  linked_person_id TEXT UNIQUE REFERENCES wl_people(id),
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'accepted', 'development', 'refused', 'failed')),
  delivery_failure TEXT CHECK (delivery_failure IS NULL OR delivery_failure IN ('mail_unavailable', 'mail_refused', 'mail_failed')),
  CHECK ((status = 'linked' AND linked_person_id IS NOT NULL) OR (status <> 'linked' AND linked_person_id IS NULL))
);
CREATE TABLE wl_preboard_eeo_answers (
  packet_id TEXT NOT NULL REFERENCES wl_preboard_packets(id),
  sequence INTEGER NOT NULL CHECK (typeof(sequence) = 'integer' AND sequence > 0),
  race_ethnicity TEXT CHECK (race_ethnicity IS NULL OR race_ethnicity IN ('hispanic_latino', 'white', 'black_african_american', 'asian', 'native_hawaiian_pacific_islander', 'american_indian_alaska_native', 'two_or_more', 'declined')),
  sex TEXT CHECK (sex IS NULL OR sex IN ('female', 'male', 'nonbinary', 'declined')),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0),
  recorded_on TEXT NOT NULL CHECK (length(recorded_on) = 10 AND recorded_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  form_version INTEGER NOT NULL CHECK (form_version IN (1, 2)),
  hispanic TEXT CHECK (hispanic IS NULL OR hispanic IN ('yes', 'no', 'declined')),
  races TEXT,
  rule_version TEXT,
  veteran TEXT CHECK (veteran IS NULL OR veteran IN ('protected', 'not_protected', 'declined')),
  veteran_classes TEXT,
  disability TEXT CHECK (disability IS NULL OR disability IN ('yes', 'no', 'declined')),
  contractor_forms TEXT,
  source TEXT NOT NULL DEFAULT 'preboarding/self-identified' CHECK (source = 'preboarding/self-identified'),
  PRIMARY KEY (packet_id, sequence)
) WITHOUT ROWID;
CREATE TRIGGER wl_preboard_identity_immutable BEFORE UPDATE ON wl_preboard_identities
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_preboard_identity_keep BEFORE DELETE ON wl_preboard_identities WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_preboard_identity_no_replace BEFORE INSERT ON wl_preboard_identities WHEN EXISTS (SELECT 1 FROM wl_preboard_identities WHERE id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_preboard_packet_keep BEFORE DELETE ON wl_preboard_packets WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_preboard_packet_no_replace BEFORE INSERT ON wl_preboard_packets
WHEN EXISTS (SELECT 1 FROM wl_preboard_packets WHERE id = NEW.id OR token_hash = NEW.token_hash OR identity_id = NEW.identity_id)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_preboard_packet_transitions BEFORE UPDATE ON wl_preboard_packets
WHEN NEW.id IS NOT OLD.id OR NEW.identity_id IS NOT OLD.identity_id OR NEW.token_hash IS NOT OLD.token_hash
  OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at OR NEW.source_on IS NOT OLD.source_on
  OR NEW.expires_on IS NOT OLD.expires_on OR NEW.expires_at IS NOT OLD.expires_at
  OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS NOT OLD.completed_at)
  OR NEW.revision < OLD.revision OR NEW.revision > OLD.revision + 1
  OR ((NEW.status IS NOT OLD.status OR NEW.completed_at IS NOT OLD.completed_at OR NEW.linked_person_id IS NOT OLD.linked_person_id) AND NEW.revision <> OLD.revision + 1)
  OR (OLD.status <> 'active' AND (NEW.status IS NOT OLD.status OR NEW.revision IS NOT OLD.revision OR NEW.completed_at IS NOT OLD.completed_at OR NEW.linked_person_id IS NOT OLD.linked_person_id))
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_preboard_answers_immutable BEFORE UPDATE ON wl_preboard_eeo_answers
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_preboard_answers_keep BEFORE DELETE ON wl_preboard_eeo_answers WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_preboard_answers_no_replace BEFORE INSERT ON wl_preboard_eeo_answers
WHEN EXISTS (SELECT 1 FROM wl_preboard_eeo_answers WHERE packet_id = NEW.packet_id AND sequence = NEW.sequence)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_preboard_answers_sequence BEFORE INSERT ON wl_preboard_eeo_answers
WHEN NEW.sequence <> COALESCE((SELECT MAX(sequence) FROM wl_preboard_eeo_answers WHERE packet_id = NEW.packet_id), 0) + 1
  OR EXISTS (SELECT 1 FROM wl_preboard_eeo_answers WHERE packet_id = NEW.packet_id AND (recorded_at > NEW.recorded_at OR recorded_on > NEW.recorded_on))
BEGIN SELECT RAISE(ABORT, 'willow_eeo_invalid_sequence'); END;
CREATE TRIGGER wl_preboard_answers_live BEFORE INSERT ON wl_preboard_eeo_answers
WHEN NOT EXISTS (SELECT 1 FROM wl_preboard_packets WHERE id = NEW.packet_id AND status = 'active'
  AND expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
BEGIN SELECT RAISE(ABORT, 'willow_guard_stale'); END;

-- Employee answers preserve original preboarding provenance and timestamps without
-- inventing a member, or attributing the hire's answers to the HR transfer operator.
-- Source ids deliberately have no FK: restricted custody can unlink independently.
CREATE TABLE wl_eeo_answers_preboarding (
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  sequence INTEGER NOT NULL CHECK (typeof(sequence) = 'integer' AND sequence > 0),
  race_ethnicity TEXT CHECK (race_ethnicity IS NULL OR race_ethnicity IN ('hispanic_latino', 'white', 'black_african_american', 'asian', 'native_hawaiian_pacific_islander', 'american_indian_alaska_native', 'two_or_more', 'declined')),
  sex TEXT CHECK (sex IS NULL OR sex IN ('female', 'male', 'nonbinary', 'declined')),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0),
  recorded_on TEXT NOT NULL CHECK (length(recorded_on) = 10 AND recorded_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  recorded_by TEXT REFERENCES wl_members(id),
  form_version INTEGER NOT NULL DEFAULT 1 CHECK (form_version IN (1, 2)),
  hispanic TEXT CHECK (hispanic IS NULL OR hispanic IN ('yes', 'no', 'declined')),
  races TEXT,
  rule_version TEXT,
  veteran TEXT CHECK (veteran IS NULL OR veteran IN ('protected', 'not_protected', 'declined')),
  veteran_classes TEXT,
  disability TEXT CHECK (disability IS NULL OR disability IN ('yes', 'no', 'declined')),
  contractor_forms TEXT,
  source TEXT NOT NULL DEFAULT 'employee/self-identified' CHECK (source IN ('employee/self-identified', 'preboarding/self-identified')),
  source_packet_id TEXT,
  source_sequence INTEGER,
  CHECK ((source = 'employee/self-identified' AND recorded_by IS NOT NULL AND source_packet_id IS NULL AND source_sequence IS NULL)
    OR (source = 'preboarding/self-identified' AND recorded_by IS NULL AND source_packet_id IS NOT NULL AND source_sequence IS NOT NULL AND source_sequence > 0)),
  PRIMARY KEY (person_id, sequence)
) WITHOUT ROWID;
INSERT INTO wl_eeo_answers_preboarding (person_id, sequence, race_ethnicity, sex, recorded_at, recorded_on, recorded_by,
  form_version, hispanic, races, rule_version, veteran, veteran_classes, disability, contractor_forms)
SELECT person_id, sequence, race_ethnicity, sex, recorded_at, recorded_on, recorded_by,
  form_version, hispanic, races, rule_version, veteran, veteran_classes, disability, contractor_forms FROM wl_eeo_answers;
DROP TABLE wl_eeo_answers;
ALTER TABLE wl_eeo_answers_preboarding RENAME TO wl_eeo_answers;
CREATE INDEX wl_eeo_answers_date ON wl_eeo_answers(person_id, recorded_on, sequence);
CREATE UNIQUE INDEX wl_eeo_answers_preboard_source ON wl_eeo_answers(source_packet_id, source_sequence) WHERE source_packet_id IS NOT NULL;
CREATE TRIGGER wl_eeo_answers_immutable BEFORE UPDATE ON wl_eeo_answers WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_answers_keep BEFORE DELETE ON wl_eeo_answers WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_answers_no_replace BEFORE INSERT ON wl_eeo_answers
WHEN EXISTS (SELECT 1 FROM wl_eeo_answers WHERE person_id = NEW.person_id AND sequence = NEW.sequence)
  OR (NEW.source_packet_id IS NOT NULL AND EXISTS (SELECT 1 FROM wl_eeo_answers WHERE source_packet_id = NEW.source_packet_id AND source_sequence = NEW.source_sequence))
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_answers_sequence BEFORE INSERT ON wl_eeo_answers
WHEN NEW.sequence <> COALESCE((SELECT MAX(sequence) FROM wl_eeo_answers WHERE person_id = NEW.person_id), 0) + 1
  OR EXISTS (SELECT 1 FROM wl_eeo_answers WHERE person_id = NEW.person_id AND (recorded_at > NEW.recorded_at OR recorded_on > NEW.recorded_on))
BEGIN SELECT RAISE(ABORT, 'willow_eeo_invalid_sequence'); END;
