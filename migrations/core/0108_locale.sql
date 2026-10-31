-- Display language and explicit, source-bound employer translations. No business value is localized.
CREATE TABLE wl_display_languages (kind TEXT NOT NULL CHECK(kind IN ('member','preboarding','applicant')), subject TEXT NOT NULL, language TEXT NOT NULL, PRIMARY KEY(kind,subject));
CREATE TABLE wl_translations (kind TEXT NOT NULL, source TEXT NOT NULL, field TEXT NOT NULL, original TEXT NOT NULL, language TEXT NOT NULL, translated TEXT NOT NULL, recorded_by TEXT NOT NULL, recorded_at INTEGER NOT NULL, PRIMARY KEY(kind,source,field,language));
CREATE TABLE wl_clock_events (id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES wl_people(id), member_id TEXT NOT NULL REFERENCES wl_members(id), kind TEXT NOT NULL CHECK(kind IN ('in','break','resume','out')), at INTEGER NOT NULL, language TEXT NOT NULL);
CREATE TRIGGER wl_clock_immutable_update BEFORE UPDATE ON wl_clock_events WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_clock_immutable_delete BEFORE DELETE ON wl_clock_events WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TABLE wl_preboard_signatures (packet_id TEXT PRIMARY KEY REFERENCES wl_preboard_packets(id), name TEXT NOT NULL, language TEXT NOT NULL, consent TEXT NOT NULL, signed_at INTEGER NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL, certificate TEXT NOT NULL);
ALTER TABLE wl_sign_payloads ADD COLUMN consent TEXT;
CREATE TABLE wl_career_publications (opening_id TEXT PRIMARY KEY REFERENCES wl_hiring_openings(id), description TEXT NOT NULL, published_by TEXT NOT NULL REFERENCES wl_members(id), revision INTEGER NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)));
ALTER TABLE wl_case_tasks ADD COLUMN translation_source TEXT;
UPDATE wl_case_tasks SET translation_source=(SELECT template_id FROM wl_cases WHERE id=case_id)||':'||position;
CREATE TRIGGER wl_preboard_signatures_no_update BEFORE UPDATE ON wl_preboard_signatures WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_preboard_signatures_no_delete BEFORE DELETE ON wl_preboard_signatures WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
