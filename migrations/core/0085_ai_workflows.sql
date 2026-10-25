-- Natural-language intake is normalized before provider use. Raw requests and
-- model transcripts are deliberately absent from this store.
CREATE TABLE wl_ai_workflows (
  id TEXT PRIMARY KEY,
  source_snapshot TEXT NOT NULL,
  normalized_request TEXT NOT NULL,
  output TEXT,
  impact TEXT,
  gaps TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('failed','pending','blocked','published')),
  failure TEXT,
  model TEXT,
  call_id TEXT,
  response_id TEXT,
  template_id TEXT REFERENCES wl_templates(id),
  review_id TEXT REFERENCES wl_workflow_reviews(id) ON DELETE SET NULL,
  audit_seq INTEGER,
  as_of TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES wl_members(id),
  created_at INTEGER NOT NULL,
  published_by TEXT REFERENCES wl_members(id),
  published_at INTEGER
);
CREATE INDEX wl_ai_workflows_created ON wl_ai_workflows(created_at);
CREATE TRIGGER wl_ai_workflow_source_immutable BEFORE UPDATE OF source_snapshot,normalized_request,as_of,created_by,created_at ON wl_ai_workflows
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_ai_workflow_output_immutable BEFORE UPDATE OF output,impact,gaps,model,call_id,response_id,template_id ON wl_ai_workflows
WHEN OLD.output IS NOT NULL
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
-- Every public native publication path respects the assistant's source and
-- connection snapshot. Native reviews still provide the audit fence as well.
CREATE TRIGGER wl_ai_workflow_native_publication BEFORE UPDATE OF publication ON wl_templates
WHEN NEW.publication='published' AND OLD.publication='draft' AND EXISTS (
  SELECT 1 FROM wl_ai_workflows w WHERE w.template_id=NEW.id AND (
    w.status<>'pending' OR w.gaps<>'[]' OR
    NOT EXISTS(SELECT 1 FROM wl_templates s WHERE s.id=json_extract(w.source_snapshot,'$.template.id') AND s.publication='published' AND s.version=json_extract(w.source_snapshot,'$.template.version') AND s.version=(SELECT MAX(latest.version) FROM wl_templates latest WHERE latest.family_id=s.family_id AND latest.publication='published')) OR
    COALESCE((SELECT revision FROM wl_connections WHERE singleton=1),'')<>COALESCE(json_extract(w.source_snapshot,'$.connections.revision'),'') OR
    COALESCE((SELECT revision FROM wl_ai_settings WHERE singleton=1),'')<>COALESCE(json_extract(w.source_snapshot,'$.connections.aiRevision'),'')
  )
)
BEGIN SELECT RAISE(ABORT,'willow_guard_workflow_source_stale'); END;
-- Publishing through the native template door and through workflow.publish
-- produces the same durable assistant outcome, in the publication transaction.
CREATE TRIGGER wl_ai_workflow_native_published AFTER UPDATE OF publication ON wl_templates
WHEN NEW.publication='published' AND OLD.publication='draft'
BEGIN
  UPDATE wl_ai_workflows SET status='published',published_by=(SELECT actor FROM wl_workflow_reviews WHERE template_id=NEW.id AND kind='publication' AND consumed_at IS NOT NULL ORDER BY consumed_at DESC LIMIT 1),published_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE template_id=NEW.id;
END;
