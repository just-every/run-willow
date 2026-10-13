-- Willow-owned observations of actual token endpoint availability. No secrets.
CREATE TABLE wl_identity_token_health (
  provider_id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  failed INTEGER NOT NULL CHECK (failed IN (0, 1)),
  observed_at INTEGER NOT NULL
);
