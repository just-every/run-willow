-- A definition selection grants no people/field, edit, scheduling or generic export authority.
CREATE TABLE wl_level_reports (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 report_id TEXT NOT NULL REFERENCES wl_saved_reports(id),
 PRIMARY KEY(level_id,report_id)
);
