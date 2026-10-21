-- DATA-002 retention census: the owner's adoption of the dated federal table,
-- confirmed work-state rules, class mappings, legal holds and erasure requests.
-- Decisions are append-only versions; the latest row wins and every row stays.
CREATE TABLE wl_retention_adoptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_version TEXT NOT NULL,
  adopted_by TEXT NOT NULL REFERENCES wl_members(id),
  adopted_at INTEGER NOT NULL
);
CREATE TABLE wl_retention_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL CHECK (length(state) = 2),
  decision TEXT NOT NULL CHECK (decision IN ('none', 'longer')),
  class TEXT NOT NULL DEFAULT 'all',
  years INTEGER CHECK (years IS NULL OR (typeof(years) = 'integer' AND years BETWEEN 1 AND 99)),
  citation TEXT,
  recorded_by TEXT NOT NULL REFERENCES wl_members(id),
  recorded_at INTEGER NOT NULL,
  CHECK ((decision = 'none' AND years IS NULL) OR (decision = 'longer' AND years IS NOT NULL AND citation IS NOT NULL))
);
CREATE TABLE wl_retention_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('document_category', 'custom_field', 'record_table')),
  ref TEXT NOT NULL,
  class TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES wl_members(id),
  recorded_at INTEGER NOT NULL
);
-- Dated and audited; EEO-001 reads the same setting. Default (no row) is not a contractor.
CREATE TABLE wl_contractor_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contractor INTEGER NOT NULL CHECK (contractor IN (0, 1)),
  covered INTEGER NOT NULL CHECK (covered IN (0, 1)),
  effective_from TEXT NOT NULL CHECK (length(effective_from) = 10),
  recorded_by TEXT NOT NULL REFERENCES wl_members(id),
  recorded_at INTEGER NOT NULL
);
CREATE TABLE wl_holds (
  id TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('person', 'document_category', 'record_class', 'date_range', 'employer')),
  scope_ref TEXT,
  from_date TEXT,
  to_date TEXT,
  reason TEXT NOT NULL,
  owner_member TEXT NOT NULL REFERENCES wl_members(id),
  review_date TEXT NOT NULL CHECK (length(review_date) = 10),
  placed_by TEXT NOT NULL REFERENCES wl_members(id),
  placed_at INTEGER NOT NULL,
  released_by TEXT REFERENCES wl_members(id),
  released_at INTEGER
);
CREATE TRIGGER wl_holds_keep BEFORE DELETE ON wl_holds BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_holds_release BEFORE UPDATE ON wl_holds
WHEN OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR NEW.id IS NOT OLD.id OR NEW.scope_kind IS NOT OLD.scope_kind OR NEW.scope_ref IS NOT OLD.scope_ref
  OR NEW.from_date IS NOT OLD.from_date OR NEW.to_date IS NOT OLD.to_date OR NEW.reason IS NOT OLD.reason OR NEW.owner_member IS NOT OLD.owner_member
  OR NEW.review_date IS NOT OLD.review_date OR NEW.placed_by IS NOT OLD.placed_by OR NEW.placed_at IS NOT OLD.placed_at
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TABLE wl_hold_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hold_id TEXT NOT NULL REFERENCES wl_holds(id),
  next_review_date TEXT NOT NULL CHECK (length(next_review_date) = 10),
  reviewed_by TEXT NOT NULL REFERENCES wl_members(id),
  reviewed_at INTEGER NOT NULL
);
CREATE TABLE wl_erasure_requests (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  source TEXT NOT NULL CHECK (source IN ('own_request', 'retention_expiry', 'counsel', 'other')),
  received_on TEXT NOT NULL CHECK (length(received_on) = 10),
  requested_by TEXT NOT NULL REFERENCES wl_members(id),
  requested_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'withdrawn')),
  confirmed_digest TEXT,
  confirmed_by TEXT REFERENCES wl_members(id),
  confirmed_at INTEGER
);
CREATE UNIQUE INDEX wl_erasure_one_open ON wl_erasure_requests(person_id) WHERE status IN ('open', 'confirmed');
