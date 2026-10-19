-- Work source records remain authoritative; this is scheduling, never completion.
CREATE TABLE wl_work_policy (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), offsets TEXT NOT NULL,
 quiet_start INTEGER NOT NULL, quiet_end INTEGER NOT NULL, default_days INTEGER NOT NULL,
 revision TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at INTEGER NOT NULL
);
CREATE TABLE wl_work_schedule (
 source TEXT PRIMARY KEY, owner TEXT REFERENCES wl_members(id), substitute TEXT REFERENCES wl_members(id),
 due_date TEXT NOT NULL, next_action TEXT NOT NULL, revision TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE wl_work_history (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, at INTEGER NOT NULL,
 actor TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE TABLE wl_work_deliveries (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, schedule_revision TEXT NOT NULL,
 policy_revision TEXT NOT NULL, step INTEGER NOT NULL, recipient TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('claimed','accepted','development','failed','refused','disabled','uncertain')),
 failure TEXT, created_at INTEGER NOT NULL,
 UNIQUE(source,schedule_revision,step)
);
