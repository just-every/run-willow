-- Approval is bound to the exact level revision and the live independent authority.
ALTER TABLE wl_api_credentials ADD COLUMN approver_operator TEXT REFERENCES oa_operators(id);
ALTER TABLE wl_api_credentials ADD COLUMN approver_version INTEGER;
ALTER TABLE wl_api_credentials ADD COLUMN approval_scope TEXT;
-- Old approvals lack a bound authority receipt and must be issued afresh.
UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approval_review_required') WHERE approved_by IS NOT NULL;
CREATE TRIGGER wl_api_approval_receipt_immutable BEFORE UPDATE ON wl_api_credentials
 WHEN OLD.approved_by IS NOT NULL AND (NEW.approver_operator IS NOT OLD.approver_operator OR NEW.approver_version IS NOT OLD.approver_version OR NEW.approval_scope IS NOT OLD.approval_scope)
 BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_api_approver_wl_permissions_insert AFTER INSERT ON wl_permissions
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approved_by IN (NEW.member_id); END;
CREATE TRIGGER wl_api_approver_wl_permissions_delete AFTER DELETE ON wl_permissions
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approved_by IN (OLD.member_id); END;
CREATE TRIGGER wl_api_approver_wl_permissions_update AFTER UPDATE ON wl_permissions
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approved_by IN (OLD.member_id,NEW.member_id); END;
CREATE TRIGGER wl_api_approver_wl_member_levels_insert AFTER INSERT ON wl_member_levels
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approved_by IN (NEW.member_id); END;
CREATE TRIGGER wl_api_approver_wl_member_levels_delete AFTER DELETE ON wl_member_levels
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approved_by IN (OLD.member_id); END;
CREATE TRIGGER wl_api_approver_wl_member_levels_update AFTER UPDATE ON wl_member_levels
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approved_by IN (OLD.member_id,NEW.member_id); END;
CREATE TRIGGER wl_api_approver_level_changed AFTER UPDATE OF version ON wl_levels WHEN OLD.version!=NEW.version
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approved_by IN (SELECT member_id FROM wl_member_levels WHERE level_id=NEW.id); END;
CREATE TRIGGER wl_api_approver_changed AFTER UPDATE ON oa_operators
 WHEN OLD.version!=NEW.version OR OLD.role!=NEW.role OR OLD.status!=NEW.status OR OLD.email!=NEW.email
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approver_operator=NEW.id; END;
CREATE TRIGGER wl_api_approver_member_changed AFTER UPDATE OF status,email ON wl_members
 WHEN OLD.status!=NEW.status OR OLD.email!=NEW.email
 BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approved_by=NEW.id; END;
