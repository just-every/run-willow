-- Native learning records; existing levels gain no additional authority.
CREATE TABLE wl_level_performance_training (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 relation TEXT NOT NULL CHECK(relation IN ('self','others')),
 field TEXT NOT NULL CHECK(field IN ('reviews','goals','engagement','trainingAssignments','trainingCompletions','trainingCertifications')),
 mode TEXT NOT NULL CHECK(mode IN ('none','view','approval','edit')),
 CHECK(field!='engagement' OR mode IN ('none','view')),
 PRIMARY KEY(level_id,relation,field)
);
INSERT INTO wl_level_performance_training SELECT * FROM wl_level_performance_fields;
DROP TABLE wl_level_performance_fields;
ALTER TABLE wl_level_performance_training RENAME TO wl_level_performance_fields;

CREATE TABLE wl_training_courses (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, self_completion INTEGER NOT NULL CHECK(self_completion IN (0,1)),
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE wl_training_assignments (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES wl_people(id), course_id TEXT NOT NULL REFERENCES wl_training_courses(id),
 due_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE wl_training_events (
 assignment_id TEXT PRIMARY KEY REFERENCES wl_training_assignments(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('completed','waived')), evidence TEXT NOT NULL, certificate TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE wl_training_requests (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES wl_people(id), operation TEXT NOT NULL CHECK(operation IN ('assign','complete','waive')),
 target_id TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), source_revision TEXT NOT NULL,
 requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL
);
CREATE TABLE wl_training_decisions (
 request_id TEXT PRIMARY KEY REFERENCES wl_training_requests(id), outcome TEXT NOT NULL CHECK(outcome IN ('approved','rejected')),
 decided_by TEXT NOT NULL, decided_at INTEGER NOT NULL, reason TEXT NOT NULL
);
CREATE TRIGGER wl_training_courses_update BEFORE UPDATE ON wl_training_courses WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_training_courses_delete BEFORE DELETE ON wl_training_courses WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_training_assignments_update BEFORE UPDATE ON wl_training_assignments WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_training_assignments_delete BEFORE DELETE ON wl_training_assignments WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_training_events_update BEFORE UPDATE ON wl_training_events WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_training_events_delete BEFORE DELETE ON wl_training_events WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_training_requests_update BEFORE UPDATE ON wl_training_requests WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_training_requests_delete BEFORE DELETE ON wl_training_requests WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_training_decisions_update BEFORE UPDATE ON wl_training_decisions WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_training_decisions_delete BEFORE DELETE ON wl_training_decisions WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
