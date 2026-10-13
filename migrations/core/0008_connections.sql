-- Optional connections contain no credentials. Runtime bindings own secrets.
CREATE TABLE wl_connections (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  notices INTEGER NOT NULL DEFAULT 0 CHECK(notices IN (0,1)),
  oidc INTEGER NOT NULL DEFAULT 0 CHECK(oidc IN (0,1)),
  model TEXT,
  revision TEXT NOT NULL
);
CREATE TABLE wl_notices (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, subject TEXT NOT NULL,
  recipient TEXT NOT NULL REFERENCES wl_members(id),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','development','failed','refused')),
  failure TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE wl_model_drafts (
  id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES wl_templates(id),
  source TEXT NOT NULL, model TEXT NOT NULL, content TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','failed','accepted','declined')),
  failure TEXT, proposed_by TEXT NOT NULL REFERENCES wl_members(id), proposed_at INTEGER NOT NULL,
  decided_by TEXT, decided_at INTEGER
);
CREATE TABLE wl_payroll_layout (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  format TEXT NOT NULL CHECK(format IN ('generic','adp-run')),
  mapping TEXT NOT NULL, revision TEXT NOT NULL
);
ALTER TABLE wl_payroll_batches ADD COLUMN file_preview TEXT;
ALTER TABLE wl_payroll_batches ADD COLUMN layout_revision TEXT;
ALTER TABLE wl_payroll_batches ADD COLUMN layout_format TEXT;
