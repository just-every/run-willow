ALTER TABLE wl_locations ADD COLUMN work_state TEXT;
ALTER TABLE wl_templates ADD COLUMN publication TEXT NOT NULL DEFAULT 'published';
ALTER TABLE wl_template_tasks ADD COLUMN rule TEXT NOT NULL DEFAULT '{"conditions":{},"dependencies":[]}';
ALTER TABLE wl_case_tasks ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wl_case_tasks ADD COLUMN dependencies TEXT NOT NULL DEFAULT '[]';
ALTER TABLE wl_case_tasks ADD COLUMN failure TEXT;
ALTER TABLE wl_case_tasks ADD COLUMN source_task TEXT;
ALTER TABLE wl_case_tasks ADD COLUMN superseded_at INTEGER;
CREATE TABLE wl_workflow_reviews (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_id TEXT NOT NULL,
  audit_seq INTEGER NOT NULL,
  as_of TEXT NOT NULL,
  detail TEXT NOT NULL,
  consumed_at INTEGER
);
CREATE TABLE wl_workflow_upgrades (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  from_template TEXT NOT NULL,
  to_template TEXT NOT NULL,
  actor TEXT NOT NULL,
  at INTEGER NOT NULL,
  detail TEXT NOT NULL
);
