-- Non-person, read-only principals. Bearer bytes never enter the database.
CREATE TABLE wl_api_credentials (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 level_version INTEGER NOT NULL,
 issued_by TEXT NOT NULL REFERENCES wl_members(id),
 issuer_operator TEXT NOT NULL REFERENCES oa_operators(id),
 issuer_version INTEGER NOT NULL,
 issued_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at > issued_at),
 last_used_at INTEGER,
 revoked_at INTEGER,
 revocation_reason TEXT,
 replaced_by TEXT REFERENCES wl_api_credentials(id),
 CHECK((revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL))
);
CREATE INDEX wl_api_credentials_issuer ON wl_api_credentials(issued_by);
CREATE INDEX wl_api_credentials_level ON wl_api_credentials(level_id);
CREATE TABLE wl_api_credential_limits (
 credential_id TEXT PRIMARY KEY REFERENCES wl_api_credentials(id),
 window INTEGER NOT NULL,
 count INTEGER NOT NULL CHECK(count > 0)
);
-- A lost right cannot return by changing the source back before the next call.
CREATE TRIGGER wl_api_level_changed AFTER UPDATE ON wl_levels
 WHEN OLD.version != NEW.version
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),
 revocation_reason=COALESCE(revocation_reason,'level_changed') WHERE level_id=NEW.id; END;
CREATE TRIGGER wl_api_issuer_changed AFTER UPDATE ON oa_operators
 WHEN OLD.version != NEW.version OR OLD.role != NEW.role OR OLD.status != NEW.status OR OLD.email != NEW.email
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),
 revocation_reason=COALESCE(revocation_reason,'issuer_changed') WHERE issuer_operator=NEW.id; END;
CREATE TRIGGER wl_api_member_changed AFTER UPDATE OF status,email ON wl_members
 WHEN OLD.status != NEW.status OR OLD.email != NEW.email
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),
 revocation_reason=COALESCE(revocation_reason,'issuer_changed') WHERE issued_by=NEW.id; END;
CREATE TRIGGER wl_api_credentials_monotonic BEFORE UPDATE ON wl_api_credentials
 WHEN NEW.id!=OLD.id OR NEW.name!=OLD.name OR NEW.token_hash!=OLD.token_hash
 OR NEW.level_id!=OLD.level_id OR NEW.level_version!=OLD.level_version OR NEW.issued_by!=OLD.issued_by
 OR NEW.issuer_operator!=OLD.issuer_operator OR NEW.issuer_version!=OLD.issuer_version
 OR NEW.issued_at!=OLD.issued_at OR NEW.expires_at!=OLD.expires_at
 OR (OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS NULL OR NEW.revoked_at!=OLD.revoked_at OR NEW.revocation_reason!=OLD.revocation_reason))
 BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
