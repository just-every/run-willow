-- Additive ROLE-004 rights: no seeded grants and no changes to existing authority.
CREATE TABLE wl_level_job_fields (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 relation TEXT NOT NULL CHECK(relation IN ('self','others')),
 field TEXT NOT NULL CHECK(field IN ('jobTitle','departmentId','locationId','managerPersonId','scheduleId','employmentType','employmentStatus','fte','startDate','endDate')),
 mode TEXT NOT NULL CHECK(mode IN ('none','view','approval','edit')),
 CHECK(relation = 'others' OR mode IN ('none','view')),
 PRIMARY KEY(level_id,relation,field)
);
