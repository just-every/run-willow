-- Explicit settings selections start empty; existing native authority is unchanged.
CREATE TABLE wl_level_settings (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 setting TEXT NOT NULL CHECK(setting IN ('company','locations','schedules','custom-fields','document-categories','integrations','payroll-connections','sign-in','api-credentials','retention')),
 PRIMARY KEY(level_id,setting)
);
