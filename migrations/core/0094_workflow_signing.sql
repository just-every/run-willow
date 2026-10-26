-- A task consumes one actor-bound native signing review. Signing completion
-- remains distinct from issue and from an assignee's evidence text.
CREATE TABLE wl_workflow_signatures (
 review_id TEXT PRIMARY KEY REFERENCES wl_sign_reviews(id),
 task_id TEXT NOT NULL REFERENCES wl_case_tasks(id),
 case_revision TEXT NOT NULL,
 issued_at INTEGER,
 verified_at INTEGER
);
CREATE UNIQUE INDEX wl_workflow_signature_issue ON wl_workflow_signatures(task_id) WHERE issued_at IS NOT NULL;
