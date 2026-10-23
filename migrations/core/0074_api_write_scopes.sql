-- Explicit opt-in adds only native personal-field approval requests, never direct edits.
ALTER TABLE wl_api_credentials ADD COLUMN write_scopes TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(write_scopes));
CREATE TRIGGER wl_api_write_scopes_immutable BEFORE UPDATE OF write_scopes ON wl_api_credentials
 WHEN OLD.write_scopes<>NEW.write_scopes BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
