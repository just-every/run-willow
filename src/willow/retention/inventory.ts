// DATA-002's inventory: every Willow table, blob store, derived store and import
// custody item that can hold a person's data, or the reason it cannot. The preview
// refuses to run if a table exists that is in neither list, so a new migration
// cannot add a store the erasure forgets.
// Parameters: ?1 person id, ?2 their member id, ?3 work email, ?4 employee number, ?5 member email (all lower-case, '' when absent).
import type { ClassKey } from './rules'

export type Kind = 'identity' | 'erase' | 'access' | 'authored' | 'history' | 'custody' | { class: ClassKey }
export interface Store {
  id: string
  table: string
  label: string
  kind: Kind
  /** FROM clause with the alias t. */
  from: string
  /** Epoch-millisecond or ISO-date expression naming when a row was recorded. */
  ms?: string
  date?: string
  /** Frozen EEO-1 run rows are kept until a submission confirmation or abandonment, which EEO-004 records; until then they carry no expiry. */
  awaiting?: boolean
  /** Expression for each row's blob size; the row owns one blob in the FILES bucket. */
  blob?: string
}

const PER = '(SELECT id FROM wl_periods WHERE person_id = ?1)'
const TERMS = `(SELECT id FROM wl_terms WHERE period_id IN ${PER})`
const ACC = `(SELECT id FROM wl_leave_accounts WHERE period_id IN ${PER})`
const REQ = '(SELECT id FROM wl_leave_requests WHERE person_id = ?1)'
const CASES = '(SELECT id FROM wl_cases WHERE person_id = ?1)'
const PCASES = '(SELECT id FROM wl_protected_cases WHERE person_id = ?1)'
const GOALS = '(SELECT id FROM wl_goals WHERE person_id = ?1)'
const OP = '(SELECT id FROM oa_operators WHERE lower(email) = ?5)'
const APPS = "(SELECT id FROM wl_hiring_applications WHERE ?3 <> '' AND lower(contact_email) = ?3)"
const SELFC = '(SELECT id FROM wl_self_changes WHERE person_id = ?1)'
const SURVEYA = '(SELECT id FROM wl_survey_answers WHERE member_id = ?2)'
const MEMBER_ROWS = (table: string, column: string): Store => ({ id: `${table}:${column}`, table, label: `${table.replace(/^wl_/, '').replace(/_/g, ' ')} authored by the person`, kind: 'authored', from: `${table} t WHERE t.${column} = ?2${table === 'wl_comp_records' ? ' AND t.person_id <> ?1' : ''}` })

const cls = (key: ClassKey): Kind => ({ class: key })
const s = (id: string, table: string, label: string, kind: Kind, from: string, extra: Partial<Store> = {}): Store => ({ id, table, label, kind, from: `${table} t WHERE ${from}`, ...extra })

export const STORES: Store[] = [
  s('webhook_deliveries','wl_webhook_deliveries','Outbound webhook delivery custody','erase','t.person_id = ?1',{ms:'t.created_at'}),
  s('people', 'wl_people', 'Legal name, preferred name, work email and employee number', 'identity', 't.id = ?1'),
  s('private', 'wl_person_private', 'Private contact details, address and date of birth', 'identity', 't.person_id = ?1'),
  s('periods', 'wl_periods', 'Employment periods', cls('payroll'), 't.person_id = ?1', { ms: 't.created_at', date: 't.end_date' }),
  s('terms', 'wl_terms', 'Employment terms and pay-rate history', cls('payroll'), `t.period_id IN ${PER}`, { ms: 't.recorded_at' }),
  s('pay', 'wl_term_pay', 'Compensation on each terms version', cls('payroll'), `t.term_id IN ${TERMS}`),
  s('entities', 'wl_period_entities', 'Legal-entity assignment of each period', cls('payroll'), `t.period_id IN ${PER}`, { ms: 't.set_at' }),
  s('leave_accounts', 'wl_leave_accounts', 'Leave accounts', cls('payroll'), `t.period_id IN ${PER}`, { ms: 't.created_at' }),
  s('leave_ledger', 'wl_ledger', 'Leave ledger entries', cls('payroll'), `t.account_id IN ${ACC}`, { ms: 't.recorded_at' }),
  s('leave_requests', 'wl_leave_requests', 'Time-off requests and decisions', cls('payroll'), 't.person_id = ?1', { ms: 't.requested_at' }),
  s('leave_reasons', 'wl_leave_reasons', 'Confidential absence reasons', cls('payroll'), `t.request_id IN ${REQ}`),
  s('leave_calculations', 'wl_leave_calculations', 'Accrual calculations', cls('payroll'), `t.account_id IN ${ACC}`, { ms: 't.recorded_at' }),
  s('leave_accrual', 'wl_leave_accrual_state', 'Pending accrual state', cls('payroll'), `t.account_id IN ${ACC}`),
  s('leave_carryover', 'wl_leave_carryover_pools', 'Carryover pools', cls('payroll'), `t.account_id IN ${ACC}`),
  s('leave_overrides', 'wl_leave_overrides', 'Balance override requests', cls('payroll'), `t.account_id IN ${ACC}`, { ms: 't.requested_at' }),
  s('leave_decisions', 'wl_leave_override_decisions', 'Balance override decisions', cls('payroll'), `t.override_id IN (SELECT id FROM wl_leave_overrides WHERE account_id IN ${ACC})`, { ms: 't.decided_at' }),
  s('leave_events', 'wl_leave_policy_events', 'Policy events on ledger entries', cls('payroll'), `t.ledger_id IN (SELECT id FROM wl_ledger WHERE account_id IN ${ACC})`),
  s('comp_proposals', 'wl_comp_proposals', 'Compensation decisions', cls('payroll'), 't.person_id = ?1', { ms: 't.requested_at' }),
  s('comp_bonuses', 'wl_comp_bonuses', 'Bonuses', cls('payroll'), 't.person_id = ?1', { ms: 't.recorded_at' }),
  s('comp_records', 'wl_comp_records', 'Native bonus and equity award versions', cls('payroll'), 't.person_id = ?1', { ms: 't.recorded_at' }),
  s('payroll_items', 'wl_payroll_items', 'Payroll handoff items', cls('payroll'), `t.source_id IN ${REQ}`),
  s('payroll_batches', 'wl_payroll_batches', 'Payroll handoff lines naming the person', cls('payroll'), 'instr(t.lines, ?1) > 0 OR instr(t.exceptions, ?1) > 0', { ms: 't.created_at' }),
  s('cases', 'wl_cases', 'Joiner, mover and leaver cases', cls('personnel'), 't.person_id = ?1', { ms: 't.opened_at' }),
  s('case_tasks', 'wl_case_tasks', 'Case tasks and evidence', cls('personnel'), `t.case_id IN ${CASES}`, { ms: 't.created_at' }),
  s('case_upgrades', 'wl_workflow_upgrades', 'Case workflow upgrades', cls('personnel'), `t.case_id IN ${CASES}`, { ms: 't.at' }),
  s('change_requests', 'wl_change_requests', 'Employee change requests', cls('personnel'), 't.person_id = ?1', { ms: 't.updated_at' }),
  s('change_events', 'wl_change_events', 'Change-request history', cls('personnel'), 't.request_id IN (SELECT id FROM wl_change_requests WHERE person_id = ?1)', { ms: 't.at' }),
  s('proposals', 'wl_proposals', 'Employee-change proposals naming the person', cls('personnel'), 'instr(t.plan, ?1) > 0 OR instr(t.diff, ?1) > 0', { ms: 't.proposed_at' }),
  s('goals', 'wl_goals', 'Goals', cls('personnel'), 't.person_id = ?1', { ms: 't.created_at' }),
  s('goal_checkins', 'wl_goal_checkins', 'Goal check-ins', cls('personnel'), `t.goal_id IN ${GOALS}`, { ms: 't.created_at' }),
  s('goal_completions', 'wl_goal_completions', 'Goal completions', cls('personnel'), `t.goal_id IN ${GOALS}`, { ms: 't.completed_at' }),
  s('review_subjects', 'wl_review_subjects', 'Review cycle membership', cls('personnel'), 't.person_id = ?1'),
  s('review_assignments', 'wl_review_assignments', 'Review assignments about the person', cls('personnel'), 't.person_id = ?1'),
  s('review_inputs', 'wl_review_inputs', 'Review inputs about the person', cls('personnel'), 't.assignment_id IN (SELECT id FROM wl_review_assignments WHERE person_id = ?1)', { ms: 't.created_at' }),
  s('review_notes', 'wl_review_notes', 'Calibration notes about the person', cls('personnel'), 't.person_id = ?1', { ms: 't.created_at' }),
  s('review_summaries', 'wl_review_summaries', 'Review summaries', cls('personnel'), 't.person_id = ?1', { ms: 't.created_at' }),
  s('review_withholdings', 'wl_review_withholdings', 'Review withholdings', cls('personnel'), 't.summary_id IN (SELECT id FROM wl_review_summaries WHERE person_id = ?1)', { ms: 't.created_at' }),
  s('applications', 'wl_hiring_applications', 'Applications under the person\'s work email', cls('personnel'), `t.id IN ${APPS}`, { ms: 't.created_at' }),
  s('resumes', 'wl_hiring_resumes', 'Resume versions', cls('personnel'), `t.application_id IN ${APPS}`, { ms: 't.uploaded_at', blob: 't.size' }),
  s('scorecards', 'wl_hiring_scorecards', 'Interviewer scorecards about the applicant', cls('personnel'), `t.application_id IN ${APPS}`, { ms: 't.created_at' }),
  s('doc_acks', 'wl_acknowledgements', 'Document receipts', cls('personnel'), 't.person_id = ?1', { ms: 't.at' }),
  s('protected_cases', 'wl_protected_cases', 'Protected-leave cases', cls('protected_leave'), 't.person_id = ?1', { ms: 't.created_at' }),
  s('protected_absences', 'wl_protected_absences', 'Protected-leave absences', cls('protected_leave'), `t.case_id IN ${PCASES}`, { ms: 't.recorded_at' }),
  s('protected_certs', 'wl_protected_certifications', 'Protected-leave certifications', cls('protected_leave'), `t.case_id IN ${PCASES}`, { ms: 't.uploaded_at', blob: 't.size' }),
  s('preboard_eeo', 'wl_preboard_eeo_answers', 'Preboarding self-identification answers', cls('eeo'), 't.packet_id IN (SELECT id FROM wl_preboard_packets WHERE linked_person_id = ?1)', {ms:'t.recorded_at'}),
  s('preboard_packets', 'wl_preboard_packets', 'Preboarding invitations', 'erase', 't.linked_person_id = ?1', {ms:'t.created_at'}),
  s('preboard_identities', 'wl_preboard_identities', 'Preboarding contact identity', 'erase', 't.id IN (SELECT identity_id FROM wl_preboard_packets WHERE linked_person_id = ?1)', {ms:'t.created_at'}),
  s('applicant_eeo', 'wl_applicant_eeo_answers', 'Application self-identification answers', cls('eeo'), `t.application_id IN ${APPS}`, {ms:'t.recorded_at'}),
  s('applicant_eeo_invites', 'wl_applicant_eeo_invitations', 'Application self-identification invitations', 'erase', `t.application_id IN ${APPS}`, {ms:'t.invited_at'}),
  s('application_closures', 'wl_hiring_closures', 'Application closure decisions', cls('personnel'), `t.application_id IN ${APPS}`, {ms:'t.closed_at'}),
  s('eeo', 'wl_eeo_answers', 'EEO self-identification answers', cls('eeo'), 't.person_id = ?1', { ms: 't.recorded_at' }),
  s('eeo_recorded', 'wl_eeo_recorded', 'HR-recorded EEO categories', cls('eeo'), 't.person_id = ?1', { ms: 't.recorded_at' }),
  s('eeo_run_rows', 'wl_eeo_run_rows', 'Frozen EEO-1 snapshot rows', cls('eeo'), 't.person_id = ?1', { awaiting: true }),
  s('eeo_run_excluded', 'wl_eeo_run_excluded', 'EEO-1 snapshot exclusions', cls('eeo'), 't.person_id = ?1', { awaiting: true }),
  s('document_proposals','wl_document_proposals','Pending and decided document revision links','erase','t.person_id = ?1'),
  s('self_changes', 'wl_self_changes', 'Personal-detail change requests', 'erase', 't.person_id = ?1', { ms: 't.requested_at' }),
  s('self_decisions', 'wl_self_decisions', 'Personal-detail change decisions', 'erase', `t.change_id IN ${SELFC}`, { ms: 't.decided_at' }),
  s('self_reconciliation', 'wl_self_reconciliation', 'Personal-detail reconciliation', 'erase', `t.change_id IN ${SELFC}`, { ms: 't.recorded_at' }),
  s('company_prefs', 'wl_company_preferences', 'Company-home celebration preferences', 'erase', 't.person_id = ?1'),
  s('company_acks', 'wl_company_acknowledgements', 'Announcement acknowledgments', 'erase', 't.member_id = ?2', { ms: 't.at' }),
  s('alert_fires', 'wl_date_alert_fires', 'Date alerts fired about the person', 'erase', 't.person_id = ?1', { ms: 't.fired_at' }),
  s('alert_tasks', 'wl_date_alert_tasks', 'Date-alert review tasks about the person', 'erase', 't.person_id = ?1', { ms: 't.created_at' }),
  s('alert_deliveries', 'wl_date_alert_deliveries', 'Date-alert deliveries to the member', 'erase', 't.member_id = ?2', { ms: 't.created_at' }),
  s('survey_members', 'wl_survey_members', 'Survey participation', 'erase', 't.person_id = ?1'),
  s('survey_answers', 'wl_survey_answers', 'Survey answers', 'erase', 't.member_id = ?2'),
  s('survey_hidden', 'wl_survey_hidden_comments', 'Hidden survey comments', 'erase', `t.answer_id IN ${SURVEYA}`, { ms: 't.hidden_at' }),
  s('review_acks', 'wl_review_acknowledgments', 'Review acknowledgments by the member', 'erase', 't.member_id = ?2', { ms: 't.created_at' }),
  s('review_appeals', 'wl_review_appeals', 'Review appeals by the member', 'erase', 't.member_id = ?2', { ms: 't.created_at' }),
  s('review_recipients', 'wl_review_recipients', 'Review release recipients', 'erase', 't.member_id = ?2', { ms: 't.created_at' }),
  s('hiring_team', 'wl_hiring_team', 'Hiring-team memberships', 'access', 't.member_id = ?2'),
  s('notices', 'wl_notices', 'Email notice log entries to the person', 'erase', 't.recipient IN (?2, ?3, ?5)', { ms: 't.created_at' }),
  s('report_deliveries', 'wl_report_deliveries', 'Scheduled-report deliveries to the member', 'erase', 't.recipient IN (?2, ?3, ?5)', { ms: 't.created_at' }),
  s('work_deliveries', 'wl_work_deliveries', 'Work-reminder deliveries to the member', 'erase', 't.recipient IN (?2, ?3, ?5)', { ms: 't.created_at' }),
  s('report_recipients', 'wl_report_schedules', 'Report-recipient entries', 'access', "?2 <> '' AND instr(t.recipients_json, ?2) > 0"),
  s('alert_recipients', 'wl_date_alerts', 'Date-alert recipient entries', 'access', "?2 <> '' AND instr(t.recipients_json, ?2) > 0"),
  s('members', 'wl_members', 'Signed-in member record', 'access', 't.id = ?2', { ms: 't.created_at' }),
  s('permissions', 'wl_permissions', 'Permission grants', 'access', 't.member_id = ?2', { ms: 't.granted_at' }),
  s('member_levels', 'wl_member_levels', 'Access-level assignments', 'access', 't.member_id = ?2'),
  s('level_review_subject','wl_level_reviews','Access-review previews naming this member or person','access',"(?2 <> '' AND (instr(t.plan,?2)>0 OR instr(t.impact,?2)>0 OR instr(t.approval_impact,?2)>0)) OR instr(t.plan,?1)>0 OR instr(t.impact,?1)>0 OR instr(t.approval_impact,?1)>0"),
  s('level_migration', 'wl_level_migration', 'Access-level migration record', 'access', 't.member_id = ?2'),
  s('operators', 'oa_operators', 'Sign-in operator', 'access', `t.id IN ${OP}`, { ms: 't.created_at' }),
  s('sessions', 'oa_sessions', 'Sessions', 'access', `t.operator_id IN ${OP}`, { ms: 't.created_at' }),
  s('credentials', 'oa_credentials', 'Credentials', 'access', `t.operator_id IN ${OP}`),
  s('tokens', 'oa_tokens', 'Invitation and sign-in tokens', 'access', `t.operator_id IN ${OP}`, { ms: 't.created_at' }),
  s('signins', 'oa_owner_signins', 'Owner sign-in links', 'access', `t.operator_id IN ${OP}`, { ms: 't.created_at' }),
  s('external_identities', 'oa_external_identities', 'Single sign-on identity links', 'access', `t.operator_id IN ${OP}`),
  s('step_up', 'oa_step_up_challenges', 'Step-up challenges', 'access', `t.operator_id IN ${OP}`, { ms: 't.created_at' }),
  s('cancellations', 'oa_invitation_cancellations', 'Invitation cancellations', 'access', `t.operator_id IN ${OP}`),
  s('provider_sessions', 'oa_provider_sessions', 'Identity-provider sessions', 'access', `t.session_id IN (SELECT id FROM oa_sessions WHERE operator_id IN ${OP})`),
  s('provider_pins', 'oa_provider_session_pins', 'Identity-provider session pins', 'access', `t.session_id IN (SELECT id FROM oa_sessions WHERE operator_id IN ${OP})`, { ms: 't.linked_at' }),
  s('setup_links', 'oa_setup_links', 'Setup links', 'access', `t.owner_id IN ${OP}`),
  s('dev_credentials', 'oa_dev_credentials', 'Development credentials', 'access', `t.id IN ${OP}`, { ms: 't.created_at' }),
  s('audit', 'wl_audit', 'Audit rows naming the person or member', 'history', 't.actor = ?2 OR t.subject IN (?1, ?2)', { ms: 't.at' }),
  s('auth_audit', 'oa_auth_audit', 'Sign-in audit rows', 'history', `t.actor_id IN ${OP}`, { ms: 't.created_at' }),
  s('work_history', 'wl_work_history', 'Work-follow-up history by the member', 'history', 't.actor = ?2', { ms: 't.at' }),
  s('import_door_originals', 'ik_door_chunks', 'Shared import upload bytes (withdrawn whole)', 'custody', '1 = 1', { blob: 't.size' }),
  s('import_door_plans', 'ik_door_plan_chunks', 'Shared import door plans (withdrawn whole)', 'custody', '1 = 1'),
  // Import custody: scanned by the person's exact identifiers; Base's erasure engine redacts it.
  s('import_provenance', 'ik_provenance', 'Import provenance for the person\'s records', 'custody', `t.target_id = ?1 OR t.target_id IN ${PER} OR t.target_id IN ${TERMS} OR (?3 <> '' AND instr(lower(t.record_json), ?3) > 0) OR (?4 <> '' AND instr(t.record_json, ?4) > 0)`),
  s('import_history', 'ik_d1_history', 'Import history of the person\'s records', 'custody', `t.target_id = ?1 OR t.target_id IN ${PER} OR t.target_id IN ${TERMS} OR (?3 <> '' AND instr(lower(t.record_json), ?3) > 0) OR (?4 <> '' AND instr(t.record_json, ?4) > 0)`),
  s('import_originals', 'ik_originals', 'Retained import originals naming the person', 'custody', "(?3 <> '' AND instr(lower(CAST(t.bytes AS TEXT)), ?3) > 0) OR (?4 <> '' AND instr(CAST(t.bytes AS TEXT), ?4) > 0)"),
  s('import_original_chunks', 'ik_d1_original_chunks', 'Chunked import originals naming the person', 'custody', "(?3 <> '' AND instr(lower(CAST(t.bytes AS TEXT)), ?3) > 0) OR (?4 <> '' AND instr(CAST(t.bytes AS TEXT), ?4) > 0)"),
  s('import_plans', 'ik_jobs', 'Import plans naming the person', 'custody', "(?3 <> '' AND instr(lower(t.plan_json), ?3) > 0) OR (?4 <> '' AND instr(t.plan_json, ?4) > 0)"),
  s('import_plan_chunks', 'ik_d1_plan_chunks', 'Chunked import plans naming the person', 'custody', "(?3 <> '' AND instr(lower(t.body), ?3) > 0) OR (?4 <> '' AND instr(t.body, ?4) > 0)"),
  s('import_targets', 'ik_targets', 'Import target images naming the person', 'custody', `t.id = ?1 OR t.id IN ${PER} OR t.id IN ${TERMS} OR (?3 <> '' AND instr(lower(t.value_json), ?3) > 0)`),
  s('import_stages', 'ik_stages', 'Staged import effects naming the person', 'custody', "(?3 <> '' AND instr(lower(CAST(t.bytes AS TEXT)), ?3) > 0)"),
  s('import_reports', 'ik_d1_reversal_reports', 'Import reversal reports naming the person', 'custody', "(?3 <> '' AND instr(lower(t.record_json), ?3) > 0)"),
]

// Rows another person's records keep: the person's attribution is replaced by the erasure label.
export const AUTHORED: [string, string][] = [
  ['wl_preboard_packets','created_by'], ['wl_applicant_eeo_invitations','invited_by'], ['wl_applicant_eeo_invitations','revoked_by'], ['wl_hiring_closures','closed_by'],
  ['wl_documents', 'created_by'], ['wl_document_versions', 'uploaded_by'], ['wl_comp_bands', 'recorded_by'], ['wl_comp_cycles', 'created_by'], ['wl_comp_records', 'recorded_by'],
  ['wl_custom_field_values', 'recorded_by'], ['wl_custom_field_versions', 'recorded_by'], ['wl_custom_fields', 'recorded_by'],
  ['wl_record_row_versions', 'recorded_by'], ['wl_record_table_versions', 'recorded_by'], ['wl_record_tables', 'recorded_by'],
  ['wl_hiring_events', 'actor'], ['wl_goal_checkins', 'author'], ['wl_surveys', 'created_by'],
  ['wl_survey_plans', 'created_by'], ['wl_templates', 'created_by'], ['wl_saved_reports', 'created_by'], ['wl_report_versions', 'recorded_by'],
  ['wl_model_drafts', 'proposed_by'], ['wl_workflow_reviews', 'actor'], ['wl_level_reviews', 'actor'], ['wl_change_chains', 'recorded_by'],
  ['wl_date_alerts', 'recorded_by'], ['wl_company_announcement_versions', 'recorded_by'], ['wl_company_file_versions', 'recorded_by'],
  ['wl_company_folder_versions', 'recorded_by'], ['wl_work_schedule', 'updated_by'], ['wl_retention_adoptions', 'adopted_by'], ['wl_retention_states', 'recorded_by'],
  ['wl_retention_mappings', 'recorded_by'], ['wl_contractor_status', 'recorded_by'], ['wl_eeo_title_map', 'recorded_by'], ['wl_eeo_establishments', 'recorded_by'], ['wl_eeo_runs', 'created_by'], ['wl_eeo_recorded', 'recorded_by'], ['wl_holds', 'placed_by'], ['wl_hold_reviews', 'reviewed_by'], ['wl_erasure_requests', 'requested_by'],
  ['wl_terms', 'recorded_by'], ['wl_terms', 'cancelled_by'], ['wl_policy_versions', 'written_by'], ['wl_policy_versions', 'approved_by'], ['wl_leave_accounts', 'approved_by'],
  ['wl_leave_requests', 'requested_by'], ['wl_leave_requests', 'decided_by'], ['wl_leave_requests', 'cancelled_by'], ['wl_ledger', 'recorded_by'], ['wl_cases', 'opened_by'], ['wl_cases', 'completed_by'],
  ['wl_case_tasks', 'assignee'], ['wl_case_tasks', 'completed_by'], ['wl_payroll_batches', 'created_by'], ['wl_payroll_batches', 'exported_by'], ['wl_payroll_batches', 'acknowledged_by'],
  ['wl_proposals', 'proposed_by'], ['wl_proposals', 'decided_by'], ['wl_model_drafts', 'decided_by'], ['wl_work_policy', 'approved_by'], ['wl_workflow_upgrades', 'actor'], ['wl_change_events', 'actor'],
  ['wl_date_alerts', 'task_assignee'], ['wl_date_alerts', 'retired_by'], ['wl_date_alert_tasks', 'assignee'], ['wl_date_alert_tasks', 'closed_by'], ['wl_report_schedules', 'approved_by'],
  ['wl_protected_cases', 'created_by'], ['wl_protected_certifications', 'uploaded_by'], ['wl_protected_absences', 'recorded_by'], ['wl_leave_overrides', 'requested_by'], ['wl_leave_override_decisions', 'decided_by'],
  ['wl_company_preferences', 'updated_by'], ['wl_comp_cycles', 'approved_by'], ['wl_comp_cycles', 'published_by'], ['wl_comp_proposals', 'requested_by'], ['wl_review_inputs', 'author'], ['wl_review_notes', 'author'],
  ['wl_review_summaries', 'created_by'], ['wl_review_withholdings', 'author'], ['wl_level_permissions', 'granted_by'], ['wl_webhooks','approved_by'], ['wl_self_changes', 'requested_by'], ['wl_self_decisions', 'decided_by'],
  ['wl_self_reconciliation', 'recorded_by'], ['wl_period_entities', 'set_by'], ['wl_permissions', 'granted_by'], ['wl_work_history', 'actor'], ['wl_audit', 'actor'], ['wl_work_schedule', 'owner'], ['wl_work_schedule', 'substitute'], ['wl_survey_plans', 'owner_member'], ['wl_provider_requests', 'recorded_by'], ['wl_provider_requests', 'assignee'],
]
export const AUTHORED_STORES: Store[] = AUTHORED.map(([table, column]) => MEMBER_ROWS(table, column))

/** Stores the preview measures per document category, custom field and record table. */
export const DYNAMIC = ['wl_documents', 'wl_document_versions', 'wl_custom_field_values', 'wl_record_rows', 'wl_record_row_versions']

/** Tables that hold no person's data, each with its reason. The preview refuses when a table is in neither list. */
const NONE = (reason: string, ...tables: string[]): [string, string][] => tables.map(table => [table, reason])
export const OUT_OF_SCOPE = new Map<string, string>([
  ...NONE('Private erasure HMAC key and value-free source tombstones; installation archives preserve the fence', 'wl_retention_import_secret', 'wl_erased_import_keys', 'wl_import_erasure_fences'),
  ...NONE('employer configuration', 'wl_employer', 'wl_connections', 'wl_import_door', 'wl_payroll_layout', 'wl_work_policy', 'wl_locations', 'wl_departments', 'wl_divisions', 'wl_legal_entities', 'wl_schedules', 'wl_doc_categories'),
  ...NONE('policy and template definitions', 'wl_policy_versions', 'wl_leave_policies', 'wl_leave_policy_rules', 'wl_template_tasks', 'wl_levels', 'wl_level_permissions', 'wl_level_scope_values', 'wl_level_self_fields', 'wl_level_other_fields', 'wl_level_document_categories', 'wl_level_reports', 'wl_level_builtin_reports', 'wl_level_settings', 'wl_level_job_fields', 'wl_level_compensation_fields', 'wl_level_leave_fields', 'wl_level_performance_fields', 'wl_level_approvals', 'wl_hiring_openings', 'wl_review_cycles', 'wl_company_announcements', 'wl_company_folders', 'wl_company_files'),
  ...NONE('the erasure window: one row inside the journaled erasure batch, never committed', 'wl_erasure_window'),
  ...NONE('restricted custody of records already removed from every live table: owner-read only, purged by rule', 'wl_retained_records'),
  ...NONE('value-free erasure receipts and the post-commit blob work list: counts, labels and content digests only', 'wl_erasure_receipts', 'wl_erasure_blobs'),
  ...NONE('in-batch precondition scratch rows, emptied by every commit', 'wl_guard'),
  ...NONE('non-portable API authentication hashes and rate counters, never employee records', 'wl_api_credentials', 'wl_api_credential_limits', 'wl_oauth_tokens'),
  ...NONE('identity-provider and installation state with no person data', 'oa_auth_settings', 'oa_bootstrap', 'oa_domain_rules', 'oa_first_run', 'oa_identity_provider_health', 'oa_identity_providers', 'oa_limits', 'oa_logout_events', 'oa_oidc_limits', 'oa_oidc_transactions', 'wl_identity_token_health', 'oc_idp_grants', 'oc_owner_claims', 'rer_dependency_codes', 'rer_dependency_installation', 'rer_dependency_keys', 'rer_dependency_link', 'rer_dependency_pending', 'rer_mail_development_outbox'),
  ...NONE('archive import lease: transfer job id, expiry timestamp and random request holder only; no person data', 'rer_portability_import_leases'),
  ...NONE('archive journal and portability state: counts, epochs and digests only', 'rer_portability_epochs', 'rer_portability_guard', 'rer_portability_jobs', 'rer_portability_journal', 'rer_portability_owned', 'rer_portability_parts', 'rer_portability_segments', 'rer_portability_state'),
  ...NONE('import engine control state: identities, fingerprints, fences and counts, never source values', 'ik_batches', 'ik_d1_assertions', 'ik_d1_creation_plans', 'ik_d1_custody_revisions', 'ik_d1_custody_states', 'ik_d1_entries', 'ik_d1_erased_sources', 'ik_d1_erased_targets', 'ik_d1_erasure_journal', 'ik_d1_erasure_progress', 'ik_d1_erasure_tally', 'ik_d1_indexed_jobs', 'ik_d1_native_staging', 'ik_d1_native_staging_index', 'ik_d1_native_staging_values', 'ik_d1_plan_index', 'ik_d1_preparation_receipts', 'ik_d1_preparation_steps', 'ik_d1_publication_fences', 'ik_d1_retirements', 'ik_d1_reversal_fences', 'ik_d1_staging', 'ik_d1_staging_chunks', 'ik_d1_staging_headers', 'ik_d1_staging_index', 'ik_d1_staging_originals', 'ik_d1_staging_pages', 'ik_d1_stream_origins', 'ik_d1_stream_pages', 'ik_d1_stream_revisions', 'ik_d1_stream_sources', 'ik_d1_streams', 'ik_door_apply_failures', 'ik_door_approvals', 'ik_door_chunks', 'ik_door_grants', 'ik_door_namespaces', 'ik_door_plan_chunks', 'ik_door_plans', 'ik_door_revoked_keys', 'ik_door_scopes', 'ik_door_settings', 'ik_door_uploads', 'ik_original_sets', 'ik_sources'),
])
