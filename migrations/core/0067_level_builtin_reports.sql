-- Built-in IDs reference the application catalog, leaving saved-report custody unchanged.
-- No selections are seeded or migrated.
CREATE TABLE wl_level_builtin_reports (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 report_id TEXT NOT NULL CHECK(report_id LIKE 'builtin-%' AND length(report_id)>8),
 PRIMARY KEY(level_id,report_id)
);
