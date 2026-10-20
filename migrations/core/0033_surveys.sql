-- ENGAGE-001. Membership is frozen on publication. Response rows deliberately
-- have no instants or person ids; anonymous rows cannot carry a member id.
CREATE TABLE wl_surveys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('onboarding','lifecycle','pulse','enps')),
  mode TEXT NOT NULL CHECK (mode IN ('named','anonymous')),
  questions_json TEXT NOT NULL CHECK (json_valid(questions_json)),
  delivery_date TEXT NOT NULL,
  due_date TEXT NOT NULL CHECK (due_date >= delivery_date),
  status TEXT NOT NULL CHECK (status IN ('open','closed')),
  created_by TEXT NOT NULL REFERENCES wl_members(id),
  created_at INTEGER NOT NULL,
  followup_of TEXT REFERENCES wl_surveys(id)
);
CREATE TABLE wl_survey_members (
  survey_id TEXT NOT NULL REFERENCES wl_surveys(id),
  member_id TEXT NOT NULL REFERENCES wl_members(id),
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  answered INTEGER NOT NULL DEFAULT 0 CHECK (answered IN (0,1)),
  declined INTEGER NOT NULL DEFAULT 0 CHECK (declined IN (0,1)),
  PRIMARY KEY (survey_id,member_id),
  CHECK (answered + declined <= 1)
);
CREATE INDEX wl_survey_members_member ON wl_survey_members(member_id,survey_id);
CREATE TABLE wl_survey_answers (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES wl_surveys(id),
  member_id TEXT,
  answers_json TEXT NOT NULL CHECK (json_valid(answers_json)),
  FOREIGN KEY (survey_id,member_id) REFERENCES wl_survey_members(survey_id,member_id)
);
CREATE UNIQUE INDEX wl_survey_answers_named ON wl_survey_answers(survey_id,member_id) WHERE member_id IS NOT NULL;
CREATE TABLE wl_survey_hidden_comments (
  answer_id TEXT PRIMARY KEY REFERENCES wl_survey_answers(id),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  hidden_by TEXT NOT NULL REFERENCES wl_members(id),
  hidden_at INTEGER NOT NULL
);
CREATE TABLE wl_survey_plans (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES wl_surveys(id),
  theme TEXT NOT NULL,
  plan TEXT NOT NULL,
  owner_member TEXT NOT NULL REFERENCES wl_members(id),
  due_date TEXT NOT NULL,
  followup_id TEXT REFERENCES wl_surveys(id),
  completed_evidence TEXT CHECK (completed_evidence IS NULL OR length(trim(completed_evidence)) BETWEEN 3 AND 1000),
  created_by TEXT NOT NULL REFERENCES wl_members(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX wl_survey_plans_survey ON wl_survey_plans(survey_id);
CREATE TRIGGER wl_surveys_immutable BEFORE UPDATE OF id,name,kind,mode,questions_json,delivery_date,due_date,created_by,created_at,followup_of ON wl_surveys
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_surveys_closed BEFORE UPDATE OF status ON wl_surveys WHEN OLD.status = 'closed'
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_surveys_keep BEFORE DELETE ON wl_surveys
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_survey_members_immutable BEFORE UPDATE OF survey_id,member_id,person_id ON wl_survey_members
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
-- The create audit is written last in the atomic publication batch. After it,
-- even an additional membership insert is a change to the published cohort.
CREATE TRIGGER wl_survey_members_sealed BEFORE INSERT ON wl_survey_members
WHEN EXISTS (SELECT 1 FROM wl_audit WHERE action='survey.create' AND subject=NEW.survey_id)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_survey_members_keep BEFORE DELETE ON wl_survey_members
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_survey_members_decide_once BEFORE UPDATE OF answered,declined ON wl_survey_members
WHEN OLD.answered=1 OR OLD.declined=1
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_survey_answers_identity BEFORE INSERT ON wl_survey_answers
WHEN NOT EXISTS (SELECT 1 FROM wl_surveys s WHERE s.id=NEW.survey_id
  AND ((s.mode='anonymous' AND NEW.member_id IS NULL) OR (s.mode='named' AND NEW.member_id IS NOT NULL)))
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_survey_answers_immutable BEFORE UPDATE ON wl_survey_answers
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_survey_hidden_comments_immutable BEFORE UPDATE ON wl_survey_hidden_comments
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_survey_plans_immutable BEFORE UPDATE OF id,survey_id,theme,plan,owner_member,due_date,followup_id,created_by,created_at ON wl_survey_plans
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_survey_plans_complete_once BEFORE UPDATE OF completed_evidence ON wl_survey_plans
WHEN OLD.completed_evidence IS NOT NULL OR NEW.completed_evidence IS NULL
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
