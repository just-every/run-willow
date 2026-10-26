ALTER TABLE wl_ai_workflows ADD COLUMN approval_revision TEXT NOT NULL DEFAULT '';
DROP TRIGGER wl_ai_workflow_source_immutable;
CREATE TRIGGER wl_ai_workflow_source_immutable BEFORE UPDATE OF source_snapshot,normalized_request,as_of,created_by,created_at ON wl_ai_workflows
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_ai_workflow_output_immutable;
CREATE TRIGGER wl_ai_workflow_output_immutable BEFORE UPDATE OF output,impact,gaps,model,call_id,response_id,template_id ON wl_ai_workflows
WHEN OLD.output IS NOT NULL AND NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_ai_workflow_revision_immutable BEFORE UPDATE OF approval_revision ON wl_ai_workflows
WHEN OLD.output IS NOT NULL AND NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;

CREATE TABLE wl_ai_workflow_step_approvals (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES wl_ai_workflows(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 40),
  authority TEXT NOT NULL CHECK(authority IN ('it','payroll')),
  revision TEXT NOT NULL,
  approved_by TEXT NOT NULL REFERENCES wl_members(id),
  approved_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX wl_ai_workflow_step_current ON wl_ai_workflow_step_approvals(workflow_id,position,authority,revision,approved_by) WHERE revoked_at IS NULL;
CREATE TRIGGER wl_ai_step_receipt_immutable BEFORE UPDATE OF id,workflow_id,position,authority,revision,approved_by,approved_at ON wl_ai_workflow_step_approvals
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_ai_step_receipt_revocation_final BEFORE UPDATE OF revoked_at ON wl_ai_workflow_step_approvals
WHEN (OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL) AND NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_ai_step_receipt_kept BEFORE DELETE ON wl_ai_workflow_step_approvals
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;

-- Preserve the privileged meaning of the source even if a proposed role changes.
CREATE VIEW wl_ai_workflow_step_requirements AS
SELECT w.id AS workflow_id,json_extract(step.value,'$.position') AS position,'it' AS authority,'it.tasks' AS permission
FROM wl_ai_workflows w,json_each(w.output,'$.steps') step
WHERE json_extract(step.value,'$.assignee')='it'
  OR json_extract(w.source_snapshot,'$.tasks[' || (json_extract(step.value,'$.position')-1) || '].assignee')='it'
  OR json_extract(w.source_snapshot,'$.tasks[' || (json_extract(step.value,'$.position')-1) || '].action')='end_access'
UNION ALL
SELECT w.id,json_extract(step.value,'$.position'),'payroll','payroll.handoff'
FROM wl_ai_workflows w,json_each(w.output,'$.steps') step
WHERE json_extract(step.value,'$.assignee')='payroll'
  OR json_extract(w.source_snapshot,'$.tasks[' || (json_extract(step.value,'$.position')-1) || '].assignee')='payroll';

CREATE VIEW wl_ai_workflow_valid_step_approvals AS
SELECT a.*,m.name AS approver_name FROM wl_ai_workflow_step_approvals a
JOIN wl_ai_workflows w ON w.id=a.workflow_id AND w.approval_revision=a.revision AND w.created_by<>a.approved_by
JOIN wl_ai_workflow_step_requirements r ON r.workflow_id=a.workflow_id AND r.position=a.position AND r.authority=a.authority
JOIN wl_members m ON m.id=a.approved_by AND m.status='active'
JOIN oa_operators o ON lower(o.email)=m.email AND o.status='active'
JOIN wl_effective_permissions p ON p.member_id=m.id AND p.permission=r.permission
WHERE a.revoked_at IS NULL AND a.revision<>'';

-- A removed grant or membership permanently invalidates its receipts. Regranting
-- access requires a new human signoff rather than reviving an old one.
CREATE TRIGGER wl_ai_step_direct_revoked AFTER DELETE ON wl_permissions
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by=OLD.member_id AND revoked_at IS NULL AND authority = CASE OLD.permission WHEN 'it.tasks' THEN 'it' WHEN 'payroll.handoff' THEN 'payroll' ELSE '' END; END;
CREATE TRIGGER wl_ai_step_direct_changed AFTER UPDATE ON wl_permissions
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by=OLD.member_id AND revoked_at IS NULL AND authority = CASE OLD.permission WHEN 'it.tasks' THEN 'it' WHEN 'payroll.handoff' THEN 'payroll' ELSE '' END; END;
CREATE TRIGGER wl_ai_step_assignment_revoked AFTER DELETE ON wl_member_levels
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by=OLD.member_id AND revoked_at IS NULL; END;
CREATE TRIGGER wl_ai_step_level_permission_revoked AFTER DELETE ON wl_level_permissions
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by IN (SELECT member_id FROM wl_member_levels WHERE level_id=OLD.level_id) AND revoked_at IS NULL; END;
CREATE TRIGGER wl_ai_step_level_permission_changed AFTER UPDATE ON wl_level_permissions
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by IN (SELECT member_id FROM wl_member_levels WHERE level_id=OLD.level_id) AND revoked_at IS NULL; END;
CREATE TRIGGER wl_ai_step_level_scope_changed AFTER UPDATE OF scope_kind ON wl_levels
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by IN (SELECT member_id FROM wl_member_levels WHERE level_id=OLD.id) AND revoked_at IS NULL; END;
CREATE TRIGGER wl_ai_step_member_ended AFTER UPDATE OF status,email ON wl_members
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by=OLD.id AND revoked_at IS NULL; END;
CREATE TRIGGER wl_ai_step_operator_ended AFTER UPDATE OF status,email ON oa_operators
BEGIN UPDATE wl_ai_workflow_step_approvals SET revoked_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE approved_by IN (SELECT id FROM wl_members WHERE email=lower(OLD.email)) AND revoked_at IS NULL; END;

CREATE TRIGGER wl_ai_workflow_step_publication BEFORE UPDATE OF publication ON wl_templates
WHEN NEW.publication='published' AND OLD.publication='draft' AND EXISTS (
 SELECT 1 FROM wl_ai_workflows w JOIN wl_ai_workflow_step_requirements r ON r.workflow_id=w.id
 WHERE w.template_id=NEW.id AND NOT EXISTS (
  SELECT 1 FROM wl_ai_workflow_valid_step_approvals a WHERE a.workflow_id=w.id AND a.position=r.position AND a.authority=r.authority
 )
)
BEGIN SELECT RAISE(ABORT,'willow_guard_workflow_step_approval_required'); END;
