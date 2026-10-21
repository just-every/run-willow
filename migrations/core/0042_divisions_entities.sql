-- ROLE-002: division and legal entity are person attributes a level's group scope can name.
-- A division groups departments, so a person's division follows their dated department.
-- A legal entity belongs to an employment period (US-002 extends this registry with its FEIN and filings).
CREATE TABLE wl_divisions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
ALTER TABLE wl_departments ADD COLUMN division_id TEXT REFERENCES wl_divisions(id);
CREATE TABLE wl_legal_entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE wl_period_entities (
  period_id TEXT PRIMARY KEY REFERENCES wl_periods(id),
  entity_id TEXT NOT NULL REFERENCES wl_legal_entities(id),
  set_by TEXT NOT NULL,
  set_at INTEGER NOT NULL
);
