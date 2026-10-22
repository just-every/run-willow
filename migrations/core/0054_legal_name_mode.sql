-- Legal names keep approval by default; no rows are seeded and no old authority widens.
CREATE TABLE wl_level_self_fields_names (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 field TEXT NOT NULL CHECK(field IN ('legalName','preferredName','personal_email','phone','address','date_of_birth','emergency_contact')),
 mode TEXT NOT NULL CHECK(mode IN ('view','approval','edit')),
 PRIMARY KEY(level_id,field)
);
INSERT INTO wl_level_self_fields_names SELECT * FROM wl_level_self_fields;
DROP TABLE wl_level_self_fields;
ALTER TABLE wl_level_self_fields_names RENAME TO wl_level_self_fields;
