-- Credentials submit native requests under their own audited non-person identity.
-- Copy dependent event custody before replacing the member-only requester constraint.
CREATE TABLE wl_change_requests_api (
  id TEXT NOT NULL PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  period_id TEXT NOT NULL REFERENCES wl_periods(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('compensation', 'job')),
  requested_by TEXT NOT NULL CHECK(length(trim(requested_by))>0),
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
CREATE TABLE wl_change_events_api (
  id TEXT NOT NULL PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES wl_change_requests_api(id),
  revision INTEGER NOT NULL,
  step INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('submitted', 'edited', 'approved', 'returned', 'declined', 'executed')),
  actor TEXT NOT NULL,
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 1000),
  at INTEGER NOT NULL CHECK (typeof(at) = 'integer')
) WITHOUT ROWID;
INSERT INTO wl_change_requests_api SELECT * FROM wl_change_requests;
INSERT INTO wl_change_events_api SELECT * FROM wl_change_events;
DROP TABLE wl_change_events;
DROP TABLE wl_change_requests;
ALTER TABLE wl_change_requests_api RENAME TO wl_change_requests;
ALTER TABLE wl_change_events_api RENAME TO wl_change_events;
CREATE INDEX wl_change_requests_status ON wl_change_requests(status,updated_at);
CREATE INDEX wl_change_events_request ON wl_change_events(request_id,at);
CREATE TRIGGER wl_change_requests_final BEFORE UPDATE ON wl_change_requests WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) AND OLD.status IN ('approved','declined') BEGIN SELECT RAISE(ABORT,'decided change requests are final'); END;
CREATE TRIGGER wl_change_requests_kept BEFORE DELETE ON wl_change_requests WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'change requests are kept'); END;
CREATE TRIGGER wl_change_events_immutable BEFORE UPDATE ON wl_change_events WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'change events are append-only'); END;
CREATE TRIGGER wl_change_events_kept BEFORE DELETE ON wl_change_events WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'change events are append-only'); END;
