-- Reviewed inclusion and notification authority. Restores must stop these policies.
CREATE TABLE wl_sign_cohorts (
 id TEXT PRIMARY KEY REFERENCES wl_sign_reviews(id),
 initiator TEXT NOT NULL REFERENCES wl_members(id),
 template_id TEXT NOT NULL REFERENCES wl_sign_templates(id),
 source_version TEXT NOT NULL REFERENCES wl_company_file_versions(id),
 source_sha256 TEXT NOT NULL, template_digest TEXT NOT NULL,
 category_id TEXT NOT NULL REFERENCES wl_doc_categories(id),
 hr_member TEXT NOT NULL REFERENCES wl_members(id),
 cohort_kind TEXT NOT NULL CHECK(cohort_kind IN ('named','everyone','location','department','employment_type','access_level')),
 cohort_value TEXT NOT NULL,
 future_joiners INTEGER NOT NULL DEFAULT 0 CHECK(future_joiners IN (0,1)),
 notify INTEGER NOT NULL DEFAULT 0 CHECK(notify IN (0,1)),
 expiry_duration INTEGER NOT NULL CHECK(expiry_duration>0),
 created_at INTEGER NOT NULL, stopped_at INTEGER,
 CHECK(cohort_kind<>'named' OR future_joiners=0)
);
CREATE TABLE wl_sign_notifications (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES wl_sign_requests(id),
 signer INTEGER NOT NULL, recipient TEXT NOT NULL REFERENCES wl_members(id),
 status TEXT NOT NULL CHECK(status IN ('claimed','accepted','development','disabled','refused','failed','uncertain')),
 failure TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(request_id,signer)
);
