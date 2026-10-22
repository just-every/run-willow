-- Legal name remains directory-readable; explicit modes add only bounded writes.
CREATE TABLE wl_level_other_names (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 field TEXT NOT NULL CHECK(field IN ('legalName','preferredName','personal_email','phone','address','date_of_birth','emergency_contact')),
 mode TEXT NOT NULL CHECK(mode IN ('none','view','approval','edit')),
 PRIMARY KEY(level_id,field)
);
INSERT INTO wl_level_other_names SELECT * FROM wl_level_other_fields;
DROP TABLE wl_level_other_fields;
ALTER TABLE wl_level_other_names RENAME TO wl_level_other_fields;
