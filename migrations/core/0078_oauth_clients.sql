-- OAuth clients share native credential ceilings, approval and permanent revocation.
ALTER TABLE wl_api_credentials ADD COLUMN credential_type TEXT NOT NULL DEFAULT 'key' CHECK(credential_type IN ('key','oauth_client'));
CREATE TRIGGER wl_api_type_immutable BEFORE UPDATE OF credential_type ON wl_api_credentials
 WHEN NEW.credential_type!=OLD.credential_type BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TABLE wl_oauth_tokens (
 token_hash TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES wl_api_credentials(id),
 expires_at INTEGER NOT NULL
);
CREATE INDEX wl_oauth_tokens_expiry ON wl_oauth_tokens(expires_at);
CREATE TRIGGER wl_oauth_tokens_immutable BEFORE UPDATE ON wl_oauth_tokens
 BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
