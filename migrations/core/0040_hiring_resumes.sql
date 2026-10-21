-- HIRING-003 resumes stay on the application, outside employee documents.
CREATE TABLE wl_hiring_resumes (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES wl_hiring_applications(id),
 version INTEGER NOT NULL, filename TEXT NOT NULL, media_type TEXT NOT NULL,
 size INTEGER NOT NULL, sha256 TEXT NOT NULL,
 uploaded_by TEXT NOT NULL REFERENCES wl_members(id), uploaded_at INTEGER NOT NULL,
 UNIQUE(application_id,version)
);
CREATE TRIGGER wl_hiring_resumes_no_update BEFORE UPDATE ON wl_hiring_resumes BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_hiring_resumes_no_delete BEFORE DELETE ON wl_hiring_resumes BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
