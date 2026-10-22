-- Additive personal-field rights. No seeded rows: migration changes no authority.
CREATE TABLE wl_level_other_fields (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 field TEXT NOT NULL CHECK(field IN ('preferredName','personal_email','phone','address','date_of_birth','emergency_contact')),
 mode TEXT NOT NULL CHECK(mode IN ('none','view','approval','edit')),
 PRIMARY KEY(level_id,field)
);
