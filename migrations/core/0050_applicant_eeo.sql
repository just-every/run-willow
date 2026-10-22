-- EEO-003: application-bound answers have no person/member or candidate projection.
-- Closure is an explicit human decision; custom stage names never imply one.
CREATE TABLE wl_hiring_closures (
  application_id TEXT PRIMARY KEY REFERENCES wl_hiring_applications(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('hired', 'rejected', 'withdrawn')),
  closed_at INTEGER NOT NULL,
  closed_by TEXT NOT NULL REFERENCES wl_members(id)
);
CREATE TABLE wl_applicant_eeo_invitations (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES wl_hiring_applications(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('pre-offer', 'post-offer')),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  contact_email TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES wl_members(id),
  invited_at INTEGER NOT NULL,
  invited_on TEXT NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > invited_at AND expires_at <= invited_at + 1209600000),
  contractor INTEGER NOT NULL CHECK (contractor IN (0, 1)),
  forms_json TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'accepted', 'development', 'failed', 'refused')),
  delivery_failure TEXT,
  revoked_at INTEGER,
  revoked_by TEXT REFERENCES wl_members(id),
  UNIQUE(id, application_id, phase)
);
CREATE INDEX wl_applicant_eeo_invitation_application ON wl_applicant_eeo_invitations(application_id, phase);
CREATE TABLE wl_applicant_eeo_answers (
  application_id TEXT NOT NULL REFERENCES wl_hiring_applications(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('pre-offer', 'post-offer')),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  invitation_id TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  recorded_on TEXT NOT NULL,
  form_version INTEGER NOT NULL CHECK (form_version IN (1, 2)),
  race_ethnicity TEXT,
  sex TEXT CHECK (sex IS NULL OR sex IN ('female', 'male', 'nonbinary', 'declined')),
  hispanic TEXT CHECK (hispanic IS NULL OR hispanic IN ('yes', 'no', 'declined')),
  races TEXT,
  rule_version TEXT,
  veteran TEXT CHECK (veteran IS NULL OR veteran IN ('protected', 'not_protected', 'declined')),
  veteran_classes TEXT,
  disability TEXT CHECK (disability IS NULL OR disability IN ('yes', 'no', 'declined')),
  contractor_forms TEXT,
  forms_json TEXT NOT NULL,
  PRIMARY KEY(application_id, phase, sequence),
  FOREIGN KEY(invitation_id, application_id, phase) REFERENCES wl_applicant_eeo_invitations(id, application_id, phase) ON DELETE CASCADE,
  CHECK (phase = 'post-offer' OR veteran_classes IS NULL OR veteran_classes = '[]')
);
CREATE TRIGGER wl_applicant_eeo_answers_immutable BEFORE UPDATE ON wl_applicant_eeo_answers
WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_applicant_eeo_answers_keep BEFORE DELETE ON wl_applicant_eeo_answers
WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_applicant_eeo_invitation_source BEFORE UPDATE OF id,application_id,phase,token_hash,contact_email,invited_by,invited_at,invited_on,expires_at,contractor,forms_json ON wl_applicant_eeo_invitations
WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_applicant_eeo_invitation_revoked BEFORE UPDATE OF revoked_at,revoked_by ON wl_applicant_eeo_invitations
WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_applicant_eeo_invitation_keep BEFORE DELETE ON wl_applicant_eeo_invitations
WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_hiring_closure_immutable BEFORE UPDATE ON wl_hiring_closures
WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_hiring_closure_keep BEFORE DELETE ON wl_hiring_closures
WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
