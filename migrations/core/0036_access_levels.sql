-- Existing rights migrate exactly, without substituting a preset or adding grants.
CREATE TABLE wl_levels (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE wl_level_permissions (
 level_id TEXT NOT NULL REFERENCES wl_levels(id), permission TEXT NOT NULL,
 granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL,
 PRIMARY KEY(level_id, permission)
);
CREATE TABLE wl_member_levels (
 member_id TEXT NOT NULL REFERENCES wl_members(id), level_id TEXT NOT NULL REFERENCES wl_levels(id),
 PRIMARY KEY(member_id, level_id)
);
INSERT INTO wl_levels(id,name)
 SELECT 'legacy-' || id, 'Migrated access: ' || email FROM wl_members;
INSERT INTO wl_level_permissions(level_id,permission,granted_by,granted_at)
 SELECT 'legacy-' || member_id,permission,granted_by,granted_at FROM wl_permissions;
INSERT INTO wl_member_levels(member_id,level_id)
 SELECT id,'legacy-' || id FROM wl_members WHERE status='active';
CREATE TABLE wl_level_migration (member_id TEXT PRIMARY KEY,name TEXT NOT NULL,before_permissions TEXT NOT NULL,after_permissions TEXT NOT NULL,widened INTEGER NOT NULL);
INSERT INTO wl_level_migration
 SELECT m.id AS member_id,m.name,
 (SELECT COALESCE(json_group_array(permission),'[]') FROM (SELECT permission FROM wl_permissions WHERE member_id=m.id ORDER BY permission)) AS before_permissions,
 (SELECT COALESCE(json_group_array(permission),'[]') FROM (SELECT p.permission FROM wl_member_levels a JOIN wl_level_permissions p ON p.level_id=a.level_id WHERE a.member_id=m.id ORDER BY p.permission)) AS after_permissions,
 (SELECT COUNT(*) FROM wl_member_levels a JOIN wl_level_permissions p ON p.level_id=a.level_id WHERE a.member_id=m.id AND NOT EXISTS(SELECT 1 FROM wl_permissions d WHERE d.member_id=m.id AND d.permission=p.permission)) AS widened
 FROM wl_members m;
DELETE FROM wl_permissions;
INSERT INTO wl_levels(id,name) VALUES ('builtin-employee','Employee'),('builtin-manager','Manager'),('builtin-hr','HR administrator'),('builtin-payroll','Payroll administrator'),('builtin-it','IT');
INSERT INTO wl_level_permissions(level_id,permission,granted_by,granted_at) VALUES
 ('builtin-hr','people.manage','migration',0),('builtin-hr','people.private','migration',0),('builtin-hr','documents.private','migration',0),('builtin-hr','leave.manage','migration',0),('builtin-hr','reports.read','migration',0),('builtin-hr','audit.read','migration',0),
 ('builtin-payroll','pay.read','migration',0),('builtin-payroll','payroll.handoff','migration',0),('builtin-it','it.tasks','migration',0);
CREATE VIEW wl_effective_permissions AS
 SELECT member_id,permission FROM wl_permissions
 UNION
 SELECT a.member_id,p.permission FROM wl_member_levels a
 JOIN wl_level_permissions p ON p.level_id=a.level_id
 JOIN wl_members m ON m.id=a.member_id AND m.status='active';
CREATE TABLE wl_level_reviews (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, snapshot INTEGER NOT NULL,
 plan TEXT NOT NULL, impact TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0
);
