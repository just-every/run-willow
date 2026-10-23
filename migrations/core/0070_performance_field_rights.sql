-- ROLE-008 starts with no added authority on built-in or migrated levels.
CREATE TABLE wl_level_performance_fields (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 relation TEXT NOT NULL CHECK(relation IN ('self','others')),
 field TEXT NOT NULL CHECK(field IN ('reviews','goals')),
 mode TEXT NOT NULL CHECK(mode IN ('none','view')),
 PRIMARY KEY(level_id,relation,field)
);
