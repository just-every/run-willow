-- Manual hiring review only. Email is contact data, never identity/merge authority.
CREATE TABLE wl_hiring_openings (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, stages TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE wl_hiring_team (
 opening_id TEXT NOT NULL REFERENCES wl_hiring_openings(id),
 member_id TEXT NOT NULL REFERENCES wl_members(id), PRIMARY KEY(opening_id,member_id)
);
CREATE TABLE wl_hiring_applications (
 id TEXT PRIMARY KEY, opening_id TEXT NOT NULL REFERENCES wl_hiring_openings(id),
 name TEXT NOT NULL, contact_email TEXT NOT NULL, source TEXT NOT NULL,
 stage TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE wl_hiring_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL REFERENCES wl_hiring_applications(id),
 actor TEXT NOT NULL REFERENCES wl_members(id), kind TEXT NOT NULL,
 from_stage TEXT, to_stage TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE TABLE wl_hiring_scorecards (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES wl_hiring_applications(id),
 author TEXT NOT NULL REFERENCES wl_members(id), version INTEGER NOT NULL,
 evidence TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(application_id,author,version)
);
CREATE TRIGGER wl_hiring_events_no_update BEFORE UPDATE ON wl_hiring_events BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_hiring_events_no_delete BEFORE DELETE ON wl_hiring_events BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_hiring_scorecards_no_update BEFORE UPDATE ON wl_hiring_scorecards BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_hiring_scorecards_no_delete BEFORE DELETE ON wl_hiring_scorecards BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
