-- Explicit compensation approval; preserve every existing grant and seed no new right.
DROP VIEW wl_effective_permissions;
CREATE TABLE wl_permissions_compensation (
  member_id TEXT NOT NULL REFERENCES wl_members(id),
  permission TEXT NOT NULL CHECK (permission IN ('people.manage', 'people.private', 'pay.read', 'leave.manage', 'payroll.handoff', 'documents.private', 'reports.read', 'it.tasks', 'audit.read', 'eeo.read', 'eeo.individual', 'compensation.approve')),
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, permission)
);
INSERT INTO wl_permissions_compensation (member_id, permission, granted_by, granted_at) SELECT member_id, permission, granted_by, granted_at FROM wl_permissions;
DROP TABLE wl_permissions;
ALTER TABLE wl_permissions_compensation RENAME TO wl_permissions;
CREATE VIEW wl_effective_permissions AS
 SELECT member_id,permission FROM wl_permissions
 UNION
 SELECT a.member_id,p.permission FROM wl_member_levels a
 JOIN wl_levels l ON l.id=a.level_id AND l.scope_kind='everyone'
 JOIN wl_level_permissions p ON p.level_id=a.level_id
 JOIN wl_members m ON m.id=a.member_id AND m.status='active';

