-- Native account/member bindings survive address changes. Only real native
-- account admission creates a binding; a Business token cannot create one.
CREATE TABLE wl_agent_people (
 operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id),
 member_id TEXT NOT NULL UNIQUE REFERENCES wl_members(id)
);
INSERT INTO wl_agent_people(operator_id,member_id)
 SELECT o.id,m.id FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email;
ALTER TABLE wl_audit ADD COLUMN agent_id TEXT;
ALTER TABLE wl_audit ADD COLUMN agent_name TEXT;
ALTER TABLE wl_audit ADD COLUMN operation_id TEXT;
ALTER TABLE wl_audit ADD COLUMN approvers TEXT;
ALTER TABLE wl_hiring_events ADD COLUMN agent_label TEXT;
ALTER TABLE wl_hiring_scorecards ADD COLUMN agent_label TEXT;

