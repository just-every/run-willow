-- Employer-installed confidential partner apps remain non-person principals.
ALTER TABLE wl_api_credentials ADD COLUMN redirect_uri TEXT;
CREATE TRIGGER wl_api_redirect_immutable BEFORE UPDATE OF redirect_uri ON wl_api_credentials
 WHEN NEW.redirect_uri IS NOT OLD.redirect_uri BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TABLE wl_oauth_codes (
 code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES wl_api_credentials(id),
 redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE wl_oauth_refresh (
 token_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES wl_api_credentials(id),
 expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE INDEX wl_oauth_codes_expiry ON wl_oauth_codes(expires_at);
CREATE INDEX wl_oauth_refresh_expiry ON wl_oauth_refresh(expires_at);
