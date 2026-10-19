-- SELF-002: immutable targeted publications, shared files and self-owned consent.
CREATE TABLE wl_company_announcements (id TEXT PRIMARY KEY);
CREATE TABLE wl_company_announcement_versions (
 id TEXT PRIMARY KEY, announcement_id TEXT NOT NULL REFERENCES wl_company_announcements(id), version INTEGER NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT,
 pinned INTEGER NOT NULL CHECK(pinned IN (0,1)), ack_required INTEGER NOT NULL CHECK(ack_required IN (0,1)),
 audience_kind TEXT NOT NULL CHECK(audience_kind IN ('everyone','location','department')), audience_id TEXT,
 retired INTEGER NOT NULL CHECK(retired IN (0,1)), recorded_at INTEGER NOT NULL, recorded_by TEXT NOT NULL,
 UNIQUE(announcement_id,version), CHECK(ends_on IS NULL OR ends_on >= starts_on),
 CHECK((audience_kind='everyone' AND audience_id IS NULL) OR (audience_kind<>'everyone' AND audience_id IS NOT NULL))
);
CREATE TABLE wl_company_acknowledgements (
 version_id TEXT NOT NULL REFERENCES wl_company_announcement_versions(id), member_id TEXT NOT NULL REFERENCES wl_members(id), at INTEGER NOT NULL,
 PRIMARY KEY(version_id,member_id)
);
CREATE TABLE wl_company_folders (id TEXT PRIMARY KEY);
CREATE TABLE wl_company_folder_versions (
 id TEXT PRIMARY KEY, folder_id TEXT NOT NULL REFERENCES wl_company_folders(id), version INTEGER NOT NULL, name TEXT NOT NULL,
 audience_kind TEXT NOT NULL CHECK(audience_kind IN ('everyone','location','department')), audience_id TEXT,
 retired INTEGER NOT NULL CHECK(retired IN (0,1)), recorded_at INTEGER NOT NULL, recorded_by TEXT NOT NULL,
 UNIQUE(folder_id,version),
 CHECK((audience_kind='everyone' AND audience_id IS NULL) OR (audience_kind<>'everyone' AND audience_id IS NOT NULL))
);
CREATE TABLE wl_company_files (id TEXT PRIMARY KEY, folder_id TEXT NOT NULL REFERENCES wl_company_folders(id));
CREATE TABLE wl_company_file_versions (
 id TEXT PRIMARY KEY, file_id TEXT NOT NULL REFERENCES wl_company_files(id), version INTEGER NOT NULL, title TEXT NOT NULL,
 filename TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0), sha256 TEXT NOT NULL,
 recorded_at INTEGER NOT NULL, recorded_by TEXT NOT NULL, UNIQUE(file_id,version)
);
CREATE TABLE wl_company_preferences (
 person_id TEXT PRIMARY KEY REFERENCES wl_people(id), birthday INTEGER NOT NULL DEFAULT 0 CHECK(birthday IN (0,1)),
 anniversary INTEGER NOT NULL DEFAULT 0 CHECK(anniversary IN (0,1)),
 updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL
);
CREATE TRIGGER wl_company_announcement_versions_immutable BEFORE UPDATE ON wl_company_announcement_versions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_company_announcement_versions_keep BEFORE DELETE ON wl_company_announcement_versions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_company_folder_versions_immutable BEFORE UPDATE ON wl_company_folder_versions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_company_folder_versions_keep BEFORE DELETE ON wl_company_folder_versions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_company_file_versions_immutable BEFORE UPDATE ON wl_company_file_versions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_company_file_versions_keep BEFORE DELETE ON wl_company_file_versions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_company_files_immutable BEFORE UPDATE ON wl_company_files BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_company_acknowledgements_immutable BEFORE UPDATE ON wl_company_acknowledgements BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_company_acknowledgements_keep BEFORE DELETE ON wl_company_acknowledgements BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
