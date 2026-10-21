-- ROLE-002: a level's about-others rights apply to everyone, direct reports, direct and
-- indirect reports, or a group of people. Every existing level migrates to everyone, so no
-- effective right changes. wl_effective_permissions stays the employer-wide union: rights from a
-- scoped level are never in it, so SQL-derived admin pickers and Base roles cannot widen them.
ALTER TABLE wl_levels ADD COLUMN scope_kind TEXT NOT NULL DEFAULT 'everyone' CHECK(scope_kind IN ('everyone','direct','indirect','group'));
CREATE TABLE wl_level_scope_values (
 level_id TEXT NOT NULL REFERENCES wl_levels(id), dimension TEXT NOT NULL, value TEXT NOT NULL,
 PRIMARY KEY(level_id, dimension, value)
);
DROP VIEW wl_effective_permissions;
CREATE VIEW wl_effective_permissions AS
 SELECT member_id,permission FROM wl_permissions
 UNION
 SELECT a.member_id,p.permission FROM wl_member_levels a
 JOIN wl_levels l ON l.id=a.level_id AND l.scope_kind='everyone'
 JOIN wl_level_permissions p ON p.level_id=a.level_id
 JOIN wl_members m ON m.id=a.member_id AND m.status='active';
CREATE VIEW wl_scoped_permissions AS
 SELECT a.member_id,a.level_id,p.permission FROM wl_member_levels a
 JOIN wl_levels l ON l.id=a.level_id AND l.scope_kind<>'everyone'
 JOIN wl_level_permissions p ON p.level_id=a.level_id
 JOIN wl_members m ON m.id=a.member_id AND m.status='active';
