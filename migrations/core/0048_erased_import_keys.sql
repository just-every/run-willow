-- Erased source identities are HMAC blind indexes, never plain source keys.
-- The private key travels only in owner installation archives, never employee exports.
CREATE TABLE wl_retention_import_secret (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  secret TEXT NOT NULL
);
CREATE TABLE wl_erased_import_keys (
  digest TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL
);

CREATE TABLE wl_import_erasure_fences (
  job_id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL
);
