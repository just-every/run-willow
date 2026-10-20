-- PERFORM-001: cycle-independent goals, append-only check-ins and completion
-- evidence. Leaving a review cycle or employment period retains this history.
CREATE TABLE wl_goals (
 id TEXT PRIMARY KEY,
 person_id TEXT NOT NULL REFERENCES wl_people(id),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 300),
 milestones_json TEXT NOT NULL CHECK(json_valid(milestones_json) AND json_type(milestones_json)='array'),
 due_date TEXT NOT NULL,
 development INTEGER NOT NULL DEFAULT 0 CHECK(development IN (0,1)),
 owner_member TEXT REFERENCES wl_members(id),
 created_by TEXT NOT NULL REFERENCES wl_members(id),
 created_at INTEGER NOT NULL,
 CHECK(development=0 OR owner_member IS NOT NULL)
);
CREATE INDEX wl_goals_person ON wl_goals(person_id,due_date);
CREATE TABLE wl_goal_checkins (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 goal_id TEXT NOT NULL REFERENCES wl_goals(id),
 author TEXT NOT NULL REFERENCES wl_members(id),
 progress INTEGER NOT NULL CHECK(typeof(progress)='integer' AND progress BETWEEN 0 AND 100),
 note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 4000),
 created_at INTEGER NOT NULL
);
CREATE INDEX wl_goal_checkins_goal ON wl_goal_checkins(goal_id,seq);
CREATE TABLE wl_goal_completions (
 goal_id TEXT PRIMARY KEY REFERENCES wl_goals(id),
 evidence TEXT NOT NULL CHECK(length(trim(evidence)) BETWEEN 3 AND 4000),
 completed_by TEXT NOT NULL REFERENCES wl_members(id),
 completed_at INTEGER NOT NULL
);
CREATE TRIGGER wl_goals_immutable BEFORE UPDATE ON wl_goals
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_goals_keep BEFORE DELETE ON wl_goals
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_goal_checkins_immutable BEFORE UPDATE ON wl_goal_checkins
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_goal_checkins_keep BEFORE DELETE ON wl_goal_checkins
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_goal_completions_immutable BEFORE UPDATE ON wl_goal_completions
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_goal_completions_keep BEFORE DELETE ON wl_goal_completions
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_goal_complete_development BEFORE INSERT ON wl_goal_completions
WHEN NOT EXISTS(SELECT 1 FROM wl_goals WHERE id=NEW.goal_id AND development=1)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_goal_checkins_open BEFORE INSERT ON wl_goal_checkins
WHEN EXISTS(SELECT 1 FROM wl_goal_completions WHERE goal_id=NEW.goal_id)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
