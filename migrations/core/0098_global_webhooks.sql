-- Outbound authority is non-portable and explicitly approved by the owner.
CREATE TABLE wl_webhooks_new (
 id TEXT PRIMARY KEY, credential_id TEXT REFERENCES wl_api_credentials(id),
 global_member TEXT REFERENCES wl_members(id), global_version INTEGER,
 endpoint TEXT NOT NULL, secret_cipher TEXT NOT NULL, fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
 events_json TEXT NOT NULL CHECK(json_valid(events_json)), monitored_fields_json TEXT NOT NULL CHECK(json_valid(monitored_fields_json)), cursor INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 0, paused INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, approved_by TEXT, approved_at INTEGER,
 CHECK ((credential_id IS NOT NULL AND global_member IS NULL AND global_version IS NULL) OR (credential_id IS NULL AND global_member IS NOT NULL AND global_version IS NOT NULL))
);
CREATE TABLE wl_webhook_deliveries_new (
 id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL REFERENCES wl_webhooks_new(id), event_key TEXT NOT NULL,
 event_type TEXT NOT NULL, person_id TEXT NOT NULL REFERENCES wl_people(id), source_seq INTEGER NOT NULL,
 due_on TEXT NOT NULL, due_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, response_code INTEGER, created_at INTEGER NOT NULL, completed_at INTEGER,
 UNIQUE(webhook_id,event_key)
);
INSERT INTO wl_webhooks_new(id,credential_id,endpoint,secret_cipher,fields_json,events_json,monitored_fields_json,cursor,active,paused,failures,created_at,approved_by,approved_at)
 SELECT id,credential_id,endpoint,secret_cipher,fields_json,events_json,monitored_fields_json,cursor,active,paused,failures,created_at,approved_by,approved_at FROM wl_webhooks;
INSERT INTO wl_webhook_deliveries_new SELECT * FROM wl_webhook_deliveries;
DROP TABLE wl_webhook_deliveries;
DROP TABLE wl_webhooks;
ALTER TABLE wl_webhooks_new RENAME TO wl_webhooks;
ALTER TABLE wl_webhook_deliveries_new RENAME TO wl_webhook_deliveries;
CREATE INDEX wl_webhook_due ON wl_webhook_deliveries(webhook_id,status,due_at,due_on);
