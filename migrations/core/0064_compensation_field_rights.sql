-- Explicit ROLE-005 grants only: built-in and migrated levels gain no field rights.
CREATE TABLE wl_level_compensation_fields (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 relation TEXT NOT NULL CHECK(relation IN ('self','others')),
 field TEXT NOT NULL CHECK(field IN ('pay','history','bands','bonus','equity','cycles')),
 mode TEXT NOT NULL CHECK(mode IN ('none','view','approval','edit')),
 CHECK(relation = 'others' OR mode IN ('none','view')),
 PRIMARY KEY(level_id,relation,field)
);
