-- FLOW-004: manager-initiated employee change requests through approval chains.
-- HR records one chain per request type; each recording appends a version.
-- A request pins the steps resolved for its current revision; editing appends
-- a revision and restarts the chain. Step events are append-only.
CREATE TABLE wl_change_chains (
  id TEXT NOT NULL PRIMARY KEY,
  request_type TEXT NOT NULL CHECK (request_type IN ('compensation', 'job')),
  steps_json TEXT NOT NULL CHECK (json_valid(steps_json) AND json_type(steps_json) = 'array' AND json_array_length(steps_json) BETWEEN 1 AND 6),
  template_id TEXT NOT NULL REFERENCES wl_templates(id),
  recorded_by TEXT NOT NULL CHECK (length(trim(recorded_by)) > 0),
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer' AND recorded_at >= 0)
) WITHOUT ROWID;
CREATE INDEX wl_change_chains_type ON wl_change_chains(request_type, recorded_at);
CREATE TRIGGER wl_change_chains_immutable BEFORE UPDATE ON wl_change_chains BEGIN SELECT RAISE(ABORT, 'change chains are append-only'); END;
CREATE TRIGGER wl_change_chains_kept BEFORE DELETE ON wl_change_chains BEGIN SELECT RAISE(ABORT, 'change chains are append-only'); END;

CREATE TABLE wl_change_requests (
  id TEXT NOT NULL PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  period_id TEXT NOT NULL REFERENCES wl_periods(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('compensation', 'job')),
  requested_by TEXT NOT NULL REFERENCES wl_members(id),
  requested_at INTEGER NOT NULL CHECK (typeof(requested_at) = 'integer'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'returned', 'approved', 'declined')),
  revision INTEGER NOT NULL CHECK (typeof(revision) = 'integer' AND revision > 0),
  chain_id TEXT NOT NULL REFERENCES wl_change_chains(id),
  steps_json TEXT NOT NULL CHECK (json_valid(steps_json) AND json_type(steps_json) = 'array'),
  step INTEGER NOT NULL CHECK (typeof(step) = 'integer' AND step >= 0),
  plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
  base_json TEXT NOT NULL CHECK (json_valid(base_json)),
  attachments_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(attachments_json) AND json_type(attachments_json) = 'array'),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer')
) WITHOUT ROWID;
CREATE INDEX wl_change_requests_status ON wl_change_requests(status, updated_at);
CREATE TRIGGER wl_change_requests_final BEFORE UPDATE ON wl_change_requests WHEN OLD.status IN ('approved', 'declined') BEGIN SELECT RAISE(ABORT, 'decided change requests are final'); END;
CREATE TRIGGER wl_change_requests_kept BEFORE DELETE ON wl_change_requests BEGIN SELECT RAISE(ABORT, 'change requests are kept'); END;

CREATE TABLE wl_change_events (
  id TEXT NOT NULL PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES wl_change_requests(id),
  revision INTEGER NOT NULL,
  step INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('submitted', 'edited', 'approved', 'returned', 'declined', 'executed')),
  actor TEXT NOT NULL,
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 1000),
  at INTEGER NOT NULL CHECK (typeof(at) = 'integer')
) WITHOUT ROWID;
CREATE INDEX wl_change_events_request ON wl_change_events(request_id, at);
CREATE TRIGGER wl_change_events_immutable BEFORE UPDATE ON wl_change_events BEGIN SELECT RAISE(ABORT, 'change events are append-only'); END;
CREATE TRIGGER wl_change_events_kept BEFORE DELETE ON wl_change_events BEGIN SELECT RAISE(ABORT, 'change events are append-only'); END;
