-- DATA-002 execution. One journaled batch may change immutable history: it holds a wl_erasure_window
-- row for its duration, inside the same transaction, and no other writer ever inserts one. Retained and
-- held records leave the live tables for restricted custody; the receipt holds only counts and labels.
CREATE TABLE wl_erasure_window (token TEXT PRIMARY KEY);
CREATE TABLE wl_retained_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  erasure_id TEXT NOT NULL,
  store TEXT NOT NULL,
  table_name TEXT NOT NULL,
  class TEXT,
  rule TEXT,
  expiry TEXT,
  hold_id TEXT,
  row_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX wl_retained_records_erasure ON wl_retained_records(erasure_id, store);
CREATE TABLE wl_erasure_receipts (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL,
  received_on TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  digest TEXT NOT NULL,
  counts_json TEXT NOT NULL,
  blobs_total INTEGER NOT NULL,
  blobs_bytes INTEGER NOT NULL,
  blobs_deleted INTEGER NOT NULL DEFAULT 0,
  scrubbed_json TEXT NOT NULL,
  copies_json TEXT NOT NULL
);
CREATE TABLE wl_erasure_blobs (
  erasure_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (erasure_id, sha256)
) WITHOUT ROWID;
ALTER TABLE wl_erasure_requests ADD COLUMN receipt_id TEXT;
-- Each provider handed the person's data gets a tracked deletion request, owner-assigned work whose outcome
-- is recorded with evidence. A failed or unanswered request stays open; Willow never claims deletion without it.
CREATE TABLE wl_provider_requests (
  id TEXT PRIMARY KEY,
  erasure_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  copies INTEGER NOT NULL,
  assignee TEXT NOT NULL REFERENCES wl_members(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'failed', 'deleted', 'retained')),
  evidence TEXT,
  reason TEXT,
  expiry TEXT,
  due_date TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  recorded_by TEXT REFERENCES wl_members(id),
  recorded_at INTEGER
);
-- 126 immutability triggers yield to the erasure window.
DROP TRIGGER wl_change_chains_immutable;
CREATE TRIGGER wl_change_chains_immutable BEFORE UPDATE ON wl_change_chains WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'change chains are append-only'); END;
DROP TRIGGER wl_change_chains_kept;
CREATE TRIGGER wl_change_chains_kept BEFORE DELETE ON wl_change_chains WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'change chains are append-only'); END;
DROP TRIGGER wl_change_events_immutable;
CREATE TRIGGER wl_change_events_immutable BEFORE UPDATE ON wl_change_events WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'change events are append-only'); END;
DROP TRIGGER wl_change_events_kept;
CREATE TRIGGER wl_change_events_kept BEFORE DELETE ON wl_change_events WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'change events are append-only'); END;
DROP TRIGGER wl_change_requests_final;
CREATE TRIGGER wl_change_requests_final BEFORE UPDATE ON wl_change_requests WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.status IN ('approved', 'declined')) BEGIN SELECT RAISE(ABORT, 'decided change requests are final'); END;
DROP TRIGGER wl_change_requests_kept;
CREATE TRIGGER wl_change_requests_kept BEFORE DELETE ON wl_change_requests WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'change requests are kept'); END;
DROP TRIGGER wl_comp_bands_no_delete;
CREATE TRIGGER wl_comp_bands_no_delete BEFORE DELETE ON wl_comp_bands WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_comp_bands_no_update;
CREATE TRIGGER wl_comp_bands_no_update BEFORE UPDATE ON wl_comp_bands WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_comp_bonuses_no_delete;
CREATE TRIGGER wl_comp_bonuses_no_delete BEFORE DELETE ON wl_comp_bonuses WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_comp_bonuses_no_update;
CREATE TRIGGER wl_comp_bonuses_no_update BEFORE UPDATE ON wl_comp_bonuses WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_comp_proposals_no_delete;
CREATE TRIGGER wl_comp_proposals_no_delete BEFORE DELETE ON wl_comp_proposals WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_comp_proposals_no_update;
CREATE TRIGGER wl_comp_proposals_no_update BEFORE UPDATE ON wl_comp_proposals WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_company_acknowledgements_immutable;
CREATE TRIGGER wl_company_acknowledgements_immutable BEFORE UPDATE ON wl_company_acknowledgements WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_company_acknowledgements_keep;
CREATE TRIGGER wl_company_acknowledgements_keep BEFORE DELETE ON wl_company_acknowledgements WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_company_announcement_versions_immutable;
CREATE TRIGGER wl_company_announcement_versions_immutable BEFORE UPDATE ON wl_company_announcement_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_company_announcement_versions_keep;
CREATE TRIGGER wl_company_announcement_versions_keep BEFORE DELETE ON wl_company_announcement_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_company_file_versions_immutable;
CREATE TRIGGER wl_company_file_versions_immutable BEFORE UPDATE ON wl_company_file_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_company_file_versions_keep;
CREATE TRIGGER wl_company_file_versions_keep BEFORE DELETE ON wl_company_file_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_company_files_immutable;
CREATE TRIGGER wl_company_files_immutable BEFORE UPDATE ON wl_company_files WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_company_folder_versions_immutable;
CREATE TRIGGER wl_company_folder_versions_immutable BEFORE UPDATE ON wl_company_folder_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_company_folder_versions_keep;
CREATE TRIGGER wl_company_folder_versions_keep BEFORE DELETE ON wl_company_folder_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_custom_field_values_immutable;
CREATE TRIGGER wl_custom_field_values_immutable BEFORE UPDATE ON wl_custom_field_values WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_custom_field_values_keep;
CREATE TRIGGER wl_custom_field_values_keep BEFORE DELETE ON wl_custom_field_values WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.origin <> 'import') BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_custom_field_versions_immutable;
CREATE TRIGGER wl_custom_field_versions_immutable BEFORE UPDATE ON wl_custom_field_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_custom_field_versions_keep;
CREATE TRIGGER wl_custom_field_versions_keep BEFORE DELETE ON wl_custom_field_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_custom_fields_immutable;
CREATE TRIGGER wl_custom_fields_immutable BEFORE UPDATE ON wl_custom_fields WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_custom_fields_keep;
CREATE TRIGGER wl_custom_fields_keep BEFORE DELETE ON wl_custom_fields WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_date_alerts_retire_only;
CREATE TRIGGER wl_date_alerts_retire_only BEFORE UPDATE ON wl_date_alerts
  WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.status = 'retired' OR NEW.label IS NOT OLD.label OR NEW.source IS NOT OLD.source OR NEW.leads_json IS NOT OLD.leads_json OR NEW.recipients_json IS NOT OLD.recipients_json OR NEW.channels_json IS NOT OLD.channels_json)
BEGIN SELECT RAISE(ABORT, 'date alerts are retired, never edited'); END;
DROP TRIGGER wl_document_versions_immutable;
CREATE TRIGGER wl_document_versions_immutable BEFORE UPDATE ON wl_document_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_answers_immutable;
CREATE TRIGGER wl_eeo_answers_immutable BEFORE UPDATE ON wl_eeo_answers WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_answers_keep;
CREATE TRIGGER wl_eeo_answers_keep BEFORE DELETE ON wl_eeo_answers WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_establishments_immutable;
CREATE TRIGGER wl_eeo_establishments_immutable BEFORE UPDATE ON wl_eeo_establishments WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_establishments_keep;
CREATE TRIGGER wl_eeo_establishments_keep BEFORE DELETE ON wl_eeo_establishments WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_recorded_immutable;
CREATE TRIGGER wl_eeo_recorded_immutable BEFORE UPDATE ON wl_eeo_recorded WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_recorded_keep;
CREATE TRIGGER wl_eeo_recorded_keep BEFORE DELETE ON wl_eeo_recorded WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_run_excluded_immutable;
CREATE TRIGGER wl_eeo_run_excluded_immutable BEFORE UPDATE ON wl_eeo_run_excluded WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_run_excluded_keep;
CREATE TRIGGER wl_eeo_run_excluded_keep BEFORE DELETE ON wl_eeo_run_excluded WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_run_rows_immutable;
CREATE TRIGGER wl_eeo_run_rows_immutable BEFORE UPDATE ON wl_eeo_run_rows WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_run_rows_keep;
CREATE TRIGGER wl_eeo_run_rows_keep BEFORE DELETE ON wl_eeo_run_rows WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_runs_immutable;
CREATE TRIGGER wl_eeo_runs_immutable BEFORE UPDATE ON wl_eeo_runs WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_runs_keep;
CREATE TRIGGER wl_eeo_runs_keep BEFORE DELETE ON wl_eeo_runs WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_title_map_immutable;
CREATE TRIGGER wl_eeo_title_map_immutable BEFORE UPDATE ON wl_eeo_title_map WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_eeo_title_map_keep;
CREATE TRIGGER wl_eeo_title_map_keep BEFORE DELETE ON wl_eeo_title_map WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_goal_checkins_immutable;
CREATE TRIGGER wl_goal_checkins_immutable BEFORE UPDATE ON wl_goal_checkins WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_goal_checkins_keep;
CREATE TRIGGER wl_goal_checkins_keep BEFORE DELETE ON wl_goal_checkins WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_goal_completions_immutable;
CREATE TRIGGER wl_goal_completions_immutable BEFORE UPDATE ON wl_goal_completions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_goal_completions_keep;
CREATE TRIGGER wl_goal_completions_keep BEFORE DELETE ON wl_goal_completions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_goals_immutable;
CREATE TRIGGER wl_goals_immutable BEFORE UPDATE ON wl_goals WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_goals_keep;
CREATE TRIGGER wl_goals_keep BEFORE DELETE ON wl_goals WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_hiring_events_no_delete;
CREATE TRIGGER wl_hiring_events_no_delete BEFORE DELETE ON wl_hiring_events WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_hiring_events_no_update;
CREATE TRIGGER wl_hiring_events_no_update BEFORE UPDATE ON wl_hiring_events WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_hiring_resumes_no_delete;
CREATE TRIGGER wl_hiring_resumes_no_delete BEFORE DELETE ON wl_hiring_resumes WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_hiring_resumes_no_update;
CREATE TRIGGER wl_hiring_resumes_no_update BEFORE UPDATE ON wl_hiring_resumes WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_hiring_scorecards_no_delete;
CREATE TRIGGER wl_hiring_scorecards_no_delete BEFORE DELETE ON wl_hiring_scorecards WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_hiring_scorecards_no_update;
CREATE TRIGGER wl_hiring_scorecards_no_update BEFORE UPDATE ON wl_hiring_scorecards WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_leave_calculations_no_delete;
CREATE TRIGGER wl_leave_calculations_no_delete BEFORE DELETE ON wl_leave_calculations WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_leave_calculations_no_update;
CREATE TRIGGER wl_leave_calculations_no_update BEFORE UPDATE ON wl_leave_calculations WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_leave_carryover_pool_keep;
CREATE TRIGGER wl_leave_carryover_pool_keep BEFORE DELETE ON wl_leave_carryover_pools WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_leave_carryover_pool_source_immutable;
CREATE TRIGGER wl_leave_carryover_pool_source_immutable BEFORE UPDATE OF account_id, year, initial_minutes, expires_on ON wl_leave_carryover_pools WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_leave_override_decisions_immutable;
CREATE TRIGGER wl_leave_override_decisions_immutable BEFORE UPDATE ON wl_leave_override_decisions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_leave_override_decisions_no_delete;
CREATE TRIGGER wl_leave_override_decisions_no_delete BEFORE DELETE ON wl_leave_override_decisions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_leave_overrides_immutable;
CREATE TRIGGER wl_leave_overrides_immutable BEFORE UPDATE ON wl_leave_overrides WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_leave_overrides_no_delete;
CREATE TRIGGER wl_leave_overrides_no_delete BEFORE DELETE ON wl_leave_overrides WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_leave_policy_events_no_delete;
CREATE TRIGGER wl_leave_policy_events_no_delete BEFORE DELETE ON wl_leave_policy_events WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_leave_policy_events_no_update;
CREATE TRIGGER wl_leave_policy_events_no_update BEFORE UPDATE ON wl_leave_policy_events WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_leave_policy_rules_no_delete;
CREATE TRIGGER wl_leave_policy_rules_no_delete BEFORE DELETE ON wl_leave_policy_rules WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_leave_policy_rules_no_update;
CREATE TRIGGER wl_leave_policy_rules_no_update BEFORE UPDATE ON wl_leave_policy_rules WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_ledger_no_delete;
CREATE TRIGGER wl_ledger_no_delete BEFORE DELETE ON wl_ledger WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_ledger_append_only'); END;
DROP TRIGGER wl_ledger_no_update;
CREATE TRIGGER wl_ledger_no_update BEFORE UPDATE ON wl_ledger WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_ledger_append_only'); END;
DROP TRIGGER wl_policy_versions_immutable;
CREATE TRIGGER wl_policy_versions_immutable BEFORE UPDATE OF policy_id, version, summary, accrual_weeks_hundredths, negative_limit_minutes ON wl_policy_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_protected_absences_immutable;
CREATE TRIGGER wl_protected_absences_immutable BEFORE UPDATE ON wl_protected_absences WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_protected_absences_no_delete;
CREATE TRIGGER wl_protected_absences_no_delete BEFORE DELETE ON wl_protected_absences WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_protected_cases_immutable;
CREATE TRIGGER wl_protected_cases_immutable BEFORE UPDATE ON wl_protected_cases WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_protected_cases_no_delete;
CREATE TRIGGER wl_protected_cases_no_delete BEFORE DELETE ON wl_protected_cases WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_protected_certifications_immutable;
CREATE TRIGGER wl_protected_certifications_immutable BEFORE UPDATE ON wl_protected_certifications WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_protected_certifications_no_delete;
CREATE TRIGGER wl_protected_certifications_no_delete BEFORE DELETE ON wl_protected_certifications WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_record_row_versions_immutable;
CREATE TRIGGER wl_record_row_versions_immutable BEFORE UPDATE ON wl_record_row_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_record_row_versions_keep;
CREATE TRIGGER wl_record_row_versions_keep BEFORE DELETE ON wl_record_row_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.origin <> 'import') BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_record_rows_keep;
CREATE TRIGGER wl_record_rows_keep BEFORE DELETE ON wl_record_rows WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.origin <> 'import') BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_record_table_versions_immutable;
CREATE TRIGGER wl_record_table_versions_immutable BEFORE UPDATE ON wl_record_table_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_record_table_versions_keep;
CREATE TRIGGER wl_record_table_versions_keep BEFORE DELETE ON wl_record_table_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_record_tables_immutable;
CREATE TRIGGER wl_record_tables_immutable BEFORE UPDATE ON wl_record_tables WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_record_tables_keep;
CREATE TRIGGER wl_record_tables_keep BEFORE DELETE ON wl_record_tables WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_report_versions_immutable;
CREATE TRIGGER wl_report_versions_immutable BEFORE UPDATE ON wl_report_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_report_versions_keep;
CREATE TRIGGER wl_report_versions_keep BEFORE DELETE ON wl_report_versions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_acknowledgments_delete;
CREATE TRIGGER wl_review_acknowledgments_delete BEFORE DELETE ON wl_review_acknowledgments WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_acknowledgments_update;
CREATE TRIGGER wl_review_acknowledgments_update BEFORE UPDATE ON wl_review_acknowledgments WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_appeals_delete;
CREATE TRIGGER wl_review_appeals_delete BEFORE DELETE ON wl_review_appeals WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_appeals_update;
CREATE TRIGGER wl_review_appeals_update BEFORE UPDATE ON wl_review_appeals WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_assignments_delete;
CREATE TRIGGER wl_review_assignments_delete BEFORE DELETE ON wl_review_assignments WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_assignments_update;
CREATE TRIGGER wl_review_assignments_update BEFORE UPDATE ON wl_review_assignments WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_cycle_config;
CREATE TRIGGER wl_review_cycle_config BEFORE UPDATE OF name,due_date,questions ON wl_review_cycles WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_cycle_delete;
CREATE TRIGGER wl_review_cycle_delete BEFORE DELETE ON wl_review_cycles WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_inputs_delete;
CREATE TRIGGER wl_review_inputs_delete BEFORE DELETE ON wl_review_inputs WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_inputs_update;
CREATE TRIGGER wl_review_inputs_update BEFORE UPDATE ON wl_review_inputs WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_notes_delete;
CREATE TRIGGER wl_review_notes_delete BEFORE DELETE ON wl_review_notes WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_notes_update;
CREATE TRIGGER wl_review_notes_update BEFORE UPDATE ON wl_review_notes WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_recipients_delete;
CREATE TRIGGER wl_review_recipients_delete BEFORE DELETE ON wl_review_recipients WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_recipients_update;
CREATE TRIGGER wl_review_recipients_update BEFORE UPDATE ON wl_review_recipients WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_subjects_delete;
CREATE TRIGGER wl_review_subjects_delete BEFORE DELETE ON wl_review_subjects WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_subjects_update;
CREATE TRIGGER wl_review_subjects_update BEFORE UPDATE ON wl_review_subjects WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_summaries_delete;
CREATE TRIGGER wl_review_summaries_delete BEFORE DELETE ON wl_review_summaries WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_summaries_update;
CREATE TRIGGER wl_review_summaries_update BEFORE UPDATE ON wl_review_summaries WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_withholdings_delete;
CREATE TRIGGER wl_review_withholdings_delete BEFORE DELETE ON wl_review_withholdings WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_review_withholdings_update;
CREATE TRIGGER wl_review_withholdings_update BEFORE UPDATE ON wl_review_withholdings WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_schedules_immutable;
CREATE TRIGGER wl_schedules_immutable BEFORE UPDATE ON wl_schedules WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_self_changes_immutable;
CREATE TRIGGER wl_self_changes_immutable BEFORE UPDATE ON wl_self_changes WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_self_changes_keep;
CREATE TRIGGER wl_self_changes_keep BEFORE DELETE ON wl_self_changes WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_self_decisions_immutable;
CREATE TRIGGER wl_self_decisions_immutable BEFORE UPDATE ON wl_self_decisions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_self_decisions_keep;
CREATE TRIGGER wl_self_decisions_keep BEFORE DELETE ON wl_self_decisions WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_self_reconciliation_immutable;
CREATE TRIGGER wl_self_reconciliation_immutable BEFORE UPDATE ON wl_self_reconciliation WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_self_reconciliation_keep;
CREATE TRIGGER wl_self_reconciliation_keep BEFORE DELETE ON wl_self_reconciliation WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_survey_answers_immutable;
CREATE TRIGGER wl_survey_answers_immutable BEFORE UPDATE ON wl_survey_answers WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_survey_hidden_comments_immutable;
CREATE TRIGGER wl_survey_hidden_comments_immutable BEFORE UPDATE ON wl_survey_hidden_comments WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_survey_members_decide_once;
CREATE TRIGGER wl_survey_members_decide_once BEFORE UPDATE OF answered,declined ON wl_survey_members WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.answered=1 OR OLD.declined=1)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_survey_members_immutable;
CREATE TRIGGER wl_survey_members_immutable BEFORE UPDATE OF survey_id,member_id,person_id ON wl_survey_members WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_survey_members_keep;
CREATE TRIGGER wl_survey_members_keep BEFORE DELETE ON wl_survey_members WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_survey_plans_complete_once;
CREATE TRIGGER wl_survey_plans_complete_once BEFORE UPDATE OF completed_evidence ON wl_survey_plans WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.completed_evidence IS NOT NULL OR NEW.completed_evidence IS NULL)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_survey_plans_immutable;
CREATE TRIGGER wl_survey_plans_immutable BEFORE UPDATE OF id,survey_id,theme,plan,owner_member,due_date,followup_id,created_by,created_at ON wl_survey_plans WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_surveys_closed;
CREATE TRIGGER wl_surveys_closed BEFORE UPDATE OF status ON wl_surveys WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.status = 'closed')
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_surveys_immutable;
CREATE TRIGGER wl_surveys_immutable BEFORE UPDATE OF id,name,kind,mode,questions_json,delivery_date,due_date,created_by,created_at,followup_of ON wl_surveys WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_surveys_keep;
CREATE TRIGGER wl_surveys_keep BEFORE DELETE ON wl_surveys WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
DROP TRIGGER wl_term_pay_immutable;
CREATE TRIGGER wl_term_pay_immutable BEFORE UPDATE ON wl_term_pay WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_terms_cancel_once;
CREATE TRIGGER wl_terms_cancel_once BEFORE UPDATE OF status ON wl_terms WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.status <> 'active') BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_terms_immutable;
CREATE TRIGGER wl_terms_immutable BEFORE UPDATE OF id, period_id, effective_from, job_title, department_id, location_id, manager_person_id, schedule_id, reason, origin, recorded_by, recorded_at ON wl_terms WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
DROP TRIGGER wl_terms_keep;
CREATE TRIGGER wl_terms_keep BEFORE DELETE ON wl_terms WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window) AND (OLD.origin <> 'import') BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
