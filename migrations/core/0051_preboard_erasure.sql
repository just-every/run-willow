-- Preboarding requests deliberately have no identity FK: erasure replaces the
-- reference with a random stub while removing both live packet and identity.
DROP INDEX wl_erasure_one_open;
DROP INDEX wl_erasure_one_open_applicant;
CREATE TABLE wl_erasure_requests_next (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES wl_people(id),
  application_id TEXT,
  preboarding_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('own_request', 'retention_expiry', 'counsel', 'other')),
  received_on TEXT NOT NULL CHECK (length(received_on) = 10),
  requested_by TEXT NOT NULL REFERENCES wl_members(id),
  requested_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'withdrawn')),
  confirmed_digest TEXT,
  confirmed_by TEXT REFERENCES wl_members(id),
  confirmed_at INTEGER,
  receipt_id TEXT,
  CHECK ((person_id IS NOT NULL) + (application_id IS NOT NULL) + (preboarding_id IS NOT NULL) = 1)
);
INSERT INTO wl_erasure_requests_next
  (id, person_id, application_id, source, received_on, requested_by, requested_at,
   status, confirmed_digest, confirmed_by, confirmed_at, receipt_id)
SELECT id, person_id, application_id, source, received_on, requested_by, requested_at,
  status, confirmed_digest, confirmed_by, confirmed_at, receipt_id FROM wl_erasure_requests;
DROP TABLE wl_erasure_requests;
ALTER TABLE wl_erasure_requests_next RENAME TO wl_erasure_requests;
CREATE UNIQUE INDEX wl_erasure_one_open ON wl_erasure_requests(person_id) WHERE person_id IS NOT NULL AND status IN ('open', 'confirmed');
CREATE UNIQUE INDEX wl_erasure_one_open_applicant ON wl_erasure_requests(application_id) WHERE application_id IS NOT NULL AND status IN ('open', 'confirmed');
CREATE UNIQUE INDEX wl_erasure_one_open_preboarding ON wl_erasure_requests(preboarding_id) WHERE preboarding_id IS NOT NULL AND status IN ('open', 'confirmed');
