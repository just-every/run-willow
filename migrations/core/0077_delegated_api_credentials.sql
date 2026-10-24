-- Delegated keys stay inert until an independent sensitive-rights approval.
ALTER TABLE wl_api_credentials ADD COLUMN needs_approval INTEGER NOT NULL DEFAULT 0 CHECK(needs_approval IN (0,1));
ALTER TABLE wl_api_credentials ADD COLUMN approved_by TEXT REFERENCES wl_members(id);
ALTER TABLE wl_api_credentials ADD COLUMN approval_reason TEXT;
CREATE TRIGGER wl_api_approval_immutable BEFORE UPDATE ON wl_api_credentials
 WHEN NEW.needs_approval!=OLD.needs_approval OR (OLD.approved_by IS NOT NULL AND (NEW.approved_by IS NOT OLD.approved_by OR NEW.approval_reason IS NOT OLD.approval_reason))
 OR (NEW.approved_by IS NOT NULL AND (NEW.approved_by=NEW.issued_by OR NEW.needs_approval=0 OR NEW.approval_reason IS NULL))
 BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_api_permissions_insert AFTER INSERT ON wl_permissions
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'issuer_access_changed') WHERE issued_by=NEW.member_id; END;
CREATE TRIGGER wl_api_permissions_delete AFTER DELETE ON wl_permissions
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'issuer_access_changed') WHERE issued_by=OLD.member_id; END;
CREATE TRIGGER wl_api_permissions_update AFTER UPDATE ON wl_permissions
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'issuer_access_changed') WHERE issued_by IN (OLD.member_id,NEW.member_id); END;
CREATE TRIGGER wl_api_member_levels_insert AFTER INSERT ON wl_member_levels
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'issuer_access_changed') WHERE issued_by=NEW.member_id; END;
CREATE TRIGGER wl_api_member_levels_delete AFTER DELETE ON wl_member_levels
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'issuer_access_changed') WHERE issued_by=OLD.member_id; END;
CREATE TRIGGER wl_api_member_levels_update AFTER UPDATE ON wl_member_levels
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'issuer_access_changed') WHERE issued_by IN (OLD.member_id,NEW.member_id); END;
CREATE TRIGGER wl_api_issuer_level_changed AFTER UPDATE OF version ON wl_levels
 WHEN OLD.version!=NEW.version
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'issuer_access_changed') WHERE issued_by IN (SELECT member_id FROM wl_member_levels WHERE level_id=NEW.id); END;
