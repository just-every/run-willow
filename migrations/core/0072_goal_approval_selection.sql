-- Preserve existing decision selections while admitting scoped goal review.
CREATE TABLE wl_level_goal_approvals (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 approval TEXT NOT NULL CHECK(
  approval IN ('leave','self:legalName','self:personal','self:dependent','self:goal',
   'change:job:hr','change:job:payroll','change:job:skip_manager',
   'change:compensation:hr','change:compensation:payroll','change:compensation:skip_manager')
  OR (approval LIKE 'document:%' AND length(approval)>9)
  OR (approval LIKE 'custom:%' AND length(approval)>7)
 ),
 PRIMARY KEY(level_id,approval)
);

INSERT INTO wl_level_goal_approvals SELECT * FROM wl_level_approvals;
DROP TABLE wl_level_approvals;
ALTER TABLE wl_level_goal_approvals RENAME TO wl_level_approvals;
