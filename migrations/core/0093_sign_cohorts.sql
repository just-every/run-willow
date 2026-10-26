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

-- Existing issued requests acquire portal work without granting inclusion or outbound authority.
INSERT INTO wl_sign_cohorts(id,initiator,template_id,source_version,source_sha256,template_digest,
 category_id,hr_member,cohort_kind,cohort_value,future_joiners,notify,expiry_duration,created_at)
SELECT r.id,r.actor,t.id,t.source_version,t.source_sha256,json_extract(r.snapshot,'$.templateDigest'),
 t.category_id,json_extract(r.snapshot,'$.hr'),json_extract(r.snapshot,'$.cohortKind'),
 COALESCE(json_extract(r.snapshot,'$.cohortValue'),''),0,0,
 MAX(1,json_extract(r.snapshot,'$.expiresAt')-r.created_at),r.used_at
FROM wl_sign_reviews r JOIN wl_sign_templates t ON t.id=r.template_id JOIN wl_members m ON m.id=r.actor
WHERE r.used_at IS NOT NULL AND EXISTS(SELECT 1 FROM wl_sign_requests q WHERE q.cohort=r.id)
 AND json_type(r.snapshot,'$.templateDigest')='text' AND json_type(r.snapshot,'$.expiresAt')='integer'
 AND json_extract(r.snapshot,'$.cohortKind') IN ('named','everyone','location','department','employment_type','access_level')
 AND EXISTS(SELECT 1 FROM wl_members c WHERE c.id=json_extract(r.snapshot,'$.hr'));
