-- Native session-authenticated signing. Reviews never send mail.
CREATE TABLE wl_sign_reviews (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, template_id TEXT NOT NULL REFERENCES wl_sign_templates(id),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), digest TEXT NOT NULL, created_at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE wl_sign_requests (
 id TEXT PRIMARY KEY, cohort TEXT NOT NULL, template_id TEXT NOT NULL REFERENCES wl_sign_templates(id),
 person_id TEXT NOT NULL REFERENCES wl_people(id), hr_member TEXT NOT NULL REFERENCES wl_members(id),
 document_id TEXT NOT NULL, rendered_sha256 TEXT NOT NULL, rendered_size INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('sent','viewed','signed','declined','expired','voided','withdrawn')),
 revision INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 sealed_version TEXT, certificate TEXT CHECK(certificate IS NULL OR json_valid(certificate)),
 UNIQUE(cohort,person_id)
);
CREATE TABLE wl_sign_events (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES wl_sign_requests(id), member_id TEXT NOT NULL,
 kind TEXT NOT NULL, signer INTEGER, at INTEGER NOT NULL, detail TEXT NOT NULL CHECK(json_valid(detail))
);
CREATE UNIQUE INDEX wl_sign_once ON wl_sign_events(request_id,signer) WHERE kind='sign';
CREATE TRIGGER wl_sign_events_immutable BEFORE UPDATE ON wl_sign_events
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_sign_sealed_immutable BEFORE UPDATE ON wl_sign_requests
WHEN OLD.state='signed' AND NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;

CREATE TABLE wl_sign_files (
 id TEXT PRIMARY KEY, request_id TEXT REFERENCES wl_sign_requests(id), person_id TEXT NOT NULL,
 sha256 TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL
);
