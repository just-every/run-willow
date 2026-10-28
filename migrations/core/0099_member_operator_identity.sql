-- Willow authority follows Base's immutable operator id. A member email remains
-- contact data and may differ from the address used to sign in.
ALTER TABLE wl_members ADD COLUMN operator_id TEXT;
CREATE UNIQUE INDEX wl_members_operator ON wl_members(operator_id) WHERE operator_id IS NOT NULL;

-- Historical stores used normalized email as the join. Bind only an
-- unambiguous pair; unresolved portable/erased rows remain unable to sign in.
UPDATE wl_members AS member SET operator_id=(
  SELECT operator.id FROM oa_operators operator
  WHERE lower(operator.email)=lower(member.email)
)
WHERE (SELECT COUNT(*) FROM oa_operators operator WHERE lower(operator.email)=lower(member.email))=1
  AND (SELECT COUNT(*) FROM wl_members candidate WHERE lower(candidate.email)=lower(member.email))=1;

DROP VIEW wl_ai_workflow_valid_step_approvals;
CREATE VIEW wl_ai_workflow_valid_step_approvals AS
SELECT a.*,m.name AS approver_name FROM wl_ai_workflow_step_approvals a
JOIN wl_ai_workflows w ON w.id=a.workflow_id AND w.approval_revision=a.revision AND w.created_by<>a.approved_by
JOIN wl_ai_workflow_step_requirements r ON r.workflow_id=a.workflow_id AND r.position=a.position AND r.authority=a.authority
JOIN wl_members m ON m.id=a.approved_by AND m.status='active'
JOIN oa_operators o ON o.id=m.operator_id AND o.status='active'
JOIN wl_effective_permissions p ON p.member_id=m.id AND p.permission=r.permission
WHERE a.revoked_at IS NULL AND a.revision<>'';

-- Contact and sign-in email changes do not change authority. Status, role and
-- operator-version changes retain the existing permanent revocation behavior.
DROP TRIGGER wl_api_issuer_changed;
CREATE TRIGGER wl_api_issuer_changed AFTER UPDATE OF version,role,status ON oa_operators
WHEN OLD.version!=NEW.version OR OLD.role!=NEW.role OR OLD.status!=NEW.status
BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),
revocation_reason=COALESCE(revocation_reason,'issuer_changed') WHERE issuer_operator=NEW.id; END;
DROP TRIGGER wl_api_member_changed;
CREATE TRIGGER wl_api_member_changed AFTER UPDATE OF status ON wl_members
WHEN OLD.status!=NEW.status
BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),
revocation_reason=COALESCE(revocation_reason,'issuer_changed') WHERE issued_by=NEW.id; END;
DROP TRIGGER wl_api_approver_changed;
CREATE TRIGGER wl_api_approver_changed AFTER UPDATE OF version,role,status ON oa_operators
WHEN OLD.version!=NEW.version OR OLD.role!=NEW.role OR OLD.status!=NEW.status
BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),
revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approver_operator=NEW.id; END;
DROP TRIGGER wl_api_approver_member_changed;
CREATE TRIGGER wl_api_approver_member_changed AFTER UPDATE OF status ON wl_members
WHEN OLD.status!=NEW.status
BEGIN UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000),
revocation_reason=COALESCE(revocation_reason,'approver_access_changed') WHERE approved_by=NEW.id; END;

DROP TRIGGER wl_ai_step_member_ended;
CREATE TRIGGER wl_ai_step_member_ended AFTER UPDATE OF status ON wl_members
WHEN OLD.status!=NEW.status
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by=OLD.id AND revoked_at IS NULL; END;
DROP TRIGGER wl_ai_step_operator_ended;
CREATE TRIGGER wl_ai_step_operator_ended AFTER UPDATE OF status,role ON oa_operators
WHEN OLD.status!=NEW.status OR OLD.role!=NEW.role
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by IN (SELECT id FROM wl_members WHERE operator_id=OLD.id) AND revoked_at IS NULL; END;
