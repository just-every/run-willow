-- Additive decision selections; no built-in or migrated level gains authority.
CREATE TABLE wl_level_approvals (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 approval TEXT NOT NULL CHECK(
  approval IN ('leave','self:legalName','self:personal','self:dependent',
   'change:job:hr','change:job:payroll','change:job:skip_manager',
   'change:compensation:hr','change:compensation:payroll','change:compensation:skip_manager')
  OR (approval LIKE 'document:%' AND length(approval)>9)
  OR (approval LIKE 'custom:%' AND length(approval)>7)
 ),
 PRIMARY KEY(level_id,approval)
);

ALTER TABLE wl_level_reviews ADD COLUMN approval_impact TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(approval_impact));
