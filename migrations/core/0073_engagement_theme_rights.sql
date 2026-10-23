-- Existing levels retain exactly their previous authority.
CREATE TABLE wl_level_performance_themes (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 relation TEXT NOT NULL CHECK(relation IN ('self','others')),
 field TEXT NOT NULL CHECK(field IN ('reviews','goals','engagement')),
 mode TEXT NOT NULL CHECK(mode IN ('none','view','approval','edit')),
 CHECK(field='goals' OR mode IN ('none','view')),
 PRIMARY KEY(level_id,relation,field)
);
INSERT INTO wl_level_performance_themes SELECT * FROM wl_level_performance_fields;
DROP TABLE wl_level_performance_fields;
ALTER TABLE wl_level_performance_themes RENAME TO wl_level_performance_fields;
