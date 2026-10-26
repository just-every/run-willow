-- Short-lived signing reviews bind the visible document and entered values to one session.
CREATE TABLE wl_sign_payloads (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES wl_sign_requests(id), member_id TEXT NOT NULL,
 session_binding TEXT NOT NULL, request_revision INTEGER NOT NULL, source_sha256 TEXT NOT NULL,
 approved_sha256 TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL,
 values_json TEXT NOT NULL CHECK(json_valid(values_json)), language TEXT NOT NULL,
 created_at INTEGER NOT NULL, used_at INTEGER
);

ALTER TABLE wl_sign_requests ADD COLUMN approved_sha256 TEXT;
UPDATE wl_sign_requests SET approved_sha256=(SELECT json_extract(value,'$.sha256') FROM wl_sign_reviews r,json_each(r.snapshot,'$.recipients') WHERE r.id=wl_sign_requests.cohort AND json_extract(value,'$.id')=wl_sign_requests.person_id);
