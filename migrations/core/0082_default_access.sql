-- Owner consent binds the exact default definition, never silently a revised grant.
CREATE TABLE wl_default_access (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 level_version INTEGER NOT NULL,
 approved_by TEXT NOT NULL,
 reason TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
