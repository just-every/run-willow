-- EEO-002: HR's title and establishment mappings (effective-dated, append-only, no EEO values) and
-- EEO compliance's frozen snapshot runs. A run keeps its roster rows, mapping versions, filing values
-- with their sources and the rule version; a later change needs a new run.
CREATE TABLE wl_eeo_title_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('exec_senior', 'first_mid', 'professionals', 'technicians', 'sales', 'admin_support', 'craft', 'operatives', 'laborers', 'service')),
  effective_from TEXT NOT NULL CHECK (length(effective_from) = 10),
  recorded_by TEXT NOT NULL REFERENCES wl_members(id),
  recorded_at INTEGER NOT NULL
);
CREATE INDEX wl_eeo_title_map_key ON wl_eeo_title_map(title_key, effective_from, id);
CREATE TABLE wl_eeo_establishments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id TEXT NOT NULL REFERENCES wl_locations(id),
  address TEXT,
  naics TEXT CHECK (naics IS NULL OR naics GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  headquarters INTEGER NOT NULL DEFAULT 0 CHECK (headquarters IN (0, 1)),
  effective_from TEXT NOT NULL CHECK (length(effective_from) = 10),
  recorded_by TEXT NOT NULL REFERENCES wl_members(id),
  recorded_at INTEGER NOT NULL
);
CREATE INDEX wl_eeo_establishments_location ON wl_eeo_establishments(location_id, effective_from, id);
CREATE TABLE wl_eeo_runs (
  id TEXT PRIMARY KEY,
  snapshot_from TEXT NOT NULL CHECK (length(snapshot_from) = 10),
  snapshot_to TEXT NOT NULL CHECK (length(snapshot_to) = 10),
  rule_version TEXT NOT NULL,
  pay_period TEXT NOT NULL,
  flags_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES wl_members(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE wl_eeo_run_rows (
  run_id TEXT NOT NULL REFERENCES wl_eeo_runs(id),
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  period_id TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  title_map_id INTEGER,
  location_id TEXT,
  establishment_map_id INTEGER,
  race_value TEXT,
  race_source TEXT,
  sex_value TEXT,
  sex_source TEXT,
  flags_json TEXT NOT NULL,
  PRIMARY KEY (run_id, person_id)
) WITHOUT ROWID;
CREATE TABLE wl_eeo_run_excluded (
  run_id TEXT NOT NULL REFERENCES wl_eeo_runs(id),
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  reason TEXT NOT NULL,
  PRIMARY KEY (run_id, person_id)
) WITHOUT ROWID;
CREATE TRIGGER wl_eeo_title_map_immutable BEFORE UPDATE ON wl_eeo_title_map BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_title_map_keep BEFORE DELETE ON wl_eeo_title_map BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_establishments_immutable BEFORE UPDATE ON wl_eeo_establishments BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_establishments_keep BEFORE DELETE ON wl_eeo_establishments BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_runs_immutable BEFORE UPDATE ON wl_eeo_runs BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_runs_keep BEFORE DELETE ON wl_eeo_runs BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_run_rows_immutable BEFORE UPDATE ON wl_eeo_run_rows BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_run_rows_keep BEFORE DELETE ON wl_eeo_run_rows BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_run_excluded_immutable BEFORE UPDATE ON wl_eeo_run_excluded BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_eeo_run_excluded_keep BEFORE DELETE ON wl_eeo_run_excluded BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
