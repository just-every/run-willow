-- Session-bound opt-in devices; no notification payload or token in audit/evidence.
CREATE TABLE wl_mobile_push (
 token TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES wl_members(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES oa_sessions(id) ON DELETE CASCADE,
 platform TEXT NOT NULL CHECK(platform IN ('ios','android')),
 created_at INTEGER NOT NULL
);
CREATE TABLE wl_mobile_deliveries (
 member_id TEXT NOT NULL REFERENCES wl_members(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('accepted','refused','failed','uncertain')),
 language TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
