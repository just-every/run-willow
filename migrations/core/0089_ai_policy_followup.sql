-- A contact request carries references and controlled status, never policy conversation content.
CREATE TABLE wl_ai_policy_escalations (
 id TEXT PRIMARY KEY,
 requested_by TEXT NOT NULL REFERENCES wl_members(id),
 person_id TEXT REFERENCES wl_people(id),
 created_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('open','resolved')),
 resolved_by TEXT REFERENCES wl_members(id),
 resolved_at INTEGER,
 CHECK((status='open' AND resolved_by IS NULL AND resolved_at IS NULL) OR (status='resolved' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX wl_ai_policy_escalations_open ON wl_ai_policy_escalations(requested_by) WHERE status='open';
