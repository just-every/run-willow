CREATE TABLE wl_ai_settings (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 enabled INTEGER NOT NULL DEFAULT 0,
 policies INTEGER NOT NULL DEFAULT 0,
 workflows INTEGER NOT NULL DEFAULT 0,
 model TEXT NOT NULL DEFAULT 'gpt-4.1-nano',
 cap_microusd INTEGER NOT NULL DEFAULT 10000,
 data_scope TEXT NOT NULL DEFAULT 'policies-only',
 retention TEXT NOT NULL DEFAULT 'no-content',
 provider_retention TEXT NOT NULL DEFAULT 'unapproved',
 revision TEXT NOT NULL
);
CREATE TABLE wl_ai_sources (
 version_id TEXT PRIMARY KEY REFERENCES wl_policy_versions(id),
 approved_by TEXT NOT NULL,
 approved_at INTEGER NOT NULL
);
CREATE TABLE wl_ai_calls (
 id TEXT PRIMARY KEY,
 actor TEXT NOT NULL,
 person_id TEXT,
 feature TEXT NOT NULL,
 model TEXT NOT NULL,
 provider TEXT NOT NULL,
 settings_revision TEXT NOT NULL,
 cap_microusd INTEGER NOT NULL,
 reserved_microusd INTEGER NOT NULL,
 actual_microusd INTEGER,
 status TEXT NOT NULL,
 response_id TEXT,
 failure TEXT,
 created_at INTEGER NOT NULL
);
